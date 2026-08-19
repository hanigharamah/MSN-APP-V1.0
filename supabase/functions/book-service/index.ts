// =============================================================================
// book-service
// =============================================================================
// Books a one-to-one service into a specific slot.
//
// The slot has to survive four independent checks before a row is written:
//
//   1. It falls inside a weekly `availability_rules` window for that provider,
//      evaluated in the *rule's own* timezone. A rule is a local wall-clock
//      window; the request is a UTC instant. Converting between them correctly
//      is the whole job — a naive UTC comparison books people at 3am twice a
//      year when the clocks move.
//   2. It does not intersect an `availability_blocks` row.
//   3. It does not intersect a live booking, including the service's
//      `buffer_minutes` on either side.
//   4. The seeker is not already booked into that time themselves.
//
// `cancellation_window_hours` is copied from the service onto the booking, so a
// later edit to the service cannot retroactively change the terms the seeker
// agreed to (policy §2.3, and the reason the column exists).
//
// POST body:
//   {
//     "service_id":  "uuid",
//     "starts_at":   "2026-09-01T14:00:00Z",
//     "timezone":    "America/New_York",   // optional, display only
//     "seeker_note": "...",                // optional
//     "platform":    "ios"|"android"|"web" // optional, drives the IAP guard
//   }

import { conflict, forbidden, json, notFound, readJson, serveJson, unprocessable } from "../_shared/errors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { optionalEnum, optionalString, requireInstant, requireUuid } from "../_shared/validate.ts";
import { addMinutes, minutesToTime, timeToMinutes, zonedParts } from "../_shared/time.ts";
import { applyBps, assertChargeable } from "../_shared/money.ts";
import { PLATFORM_FEE_BPS, paymentBypassEnabled } from "../_shared/env.ts";
import { stripeClient, translateStripeError } from "../_shared/stripe.ts";
import { deepLink, notifyUser } from "../_shared/notify.ts";

/** Statuses that still occupy the provider's calendar. */
const LIVE_BOOKING_STATUSES = ["requested", "confirmed", "completed"];

/** How far ahead we let someone book. Guards against absurd input. */
const MAX_LEAD_DAYS = 400;


/**
 * Releases a booking whose payment could not be set up.
 *
 * A booking row holds its slot via the exclusion constraints in migration 0010,
 * so leaving one behind after a failed payment blocks that time for everyone,
 * including the seeker who just failed to book it.
 */
async function releaseBooking(admin: ReturnType<typeof adminClient>, bookingId: string) {
  await admin
    .from("bookings")
    .update({ status: "cancelled_by_seeker", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId)
    .in("status", ["requested", "confirmed"]);
}

Deno.serve(serveJson(async (req) => {
  const caller = await requireUser(req);
  const admin = adminClient();
  const body = await readJson(req);

  const serviceId = requireUuid(body.service_id, "service_id");
  const startsAt = requireInstant(body.starts_at, "starts_at");
  const displayTimezone = optionalString(body.timezone, "timezone", 64);
  const seekerNote = optionalString(body.seeker_note, "seeker_note", 2000);
  const platform = optionalEnum(body.platform, "platform", ["ios", "android", "web"] as const, "web");

  const now = new Date();
  if (startsAt <= now) {
    throw unprocessable(
      "slot_in_the_past",
      `\`starts_at\` (${startsAt.toISOString()}) is in the past.`,
      "Send a future instant. Check the device clock and that you are sending UTC, not local time.",
    );
  }
  if (startsAt.getTime() - now.getTime() > MAX_LEAD_DAYS * 86_400_000) {
    throw unprocessable(
      "slot_too_far_ahead",
      `Bookings cannot be made more than ${MAX_LEAD_DAYS} days ahead.`,
      "Limit the date picker's range.",
    );
  }

  // ------------------------------------------------------------- service
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, provider_id, title, delivery_mode, duration_minutes, buffer_minutes, price_cents, currency, cancellation_window_hours, requires_approval, is_active")
    .eq("id", serviceId)
    .maybeSingle();
  if (serviceError) throw serviceError;
  if (!service) {
    throw notFound("service_not_found", `No service with id ${serviceId}.`, "Refresh the provider's listing — it may have been removed.");
  }
  if (!service.is_active) {
    throw conflict("service_inactive", `"${service.title}" is not currently offered.`, "Hide inactive services from the booking flow.");
  }
  if (service.provider_id === caller.userId) {
    throw forbidden("You cannot book your own service.", "Hide the booking button on your own listings.");
  }

  // Apple 3.1.3(d)/(e). `one_to_one` is the case Apple explicitly permits to be
  // paid outside the app; `online_live` is not.
  if (service.delivery_mode === "online_live" && platform !== "web") {
    throw forbidden(
      `"${service.title}" is a one-to-many live service, which must be sold through in-app purchase on ${platform === "ios" ? "iOS" : "Android"}.`,
      "Use the store purchase sheet and record the booking with rail `apple_iap` / `google_play`.",
    );
  }

  const endsAt = addMinutes(startsAt, service.duration_minutes as number);
  const buffer = service.buffer_minutes as number;
  // The window the provider is actually occupied for, buffers included.
  const busyStart = addMinutes(startsAt, -buffer);
  const busyEnd = addMinutes(endsAt, buffer);

  // ---------------------------------------------------- provider is taking work
  const { data: providerDetail } = await admin
    .from("provider_details")
    .select("accepts_bookings, is_out_of_office, out_of_office_until")
    .eq("profile_id", service.provider_id)
    .maybeSingle();

  if (providerDetail && !providerDetail.accepts_bookings) {
    throw conflict(
      "provider_not_accepting",
      "This practitioner is not accepting bookings right now.",
      "Show the 'not accepting bookings' state on their profile and hide the booking button.",
    );
  }
  if (providerDetail?.is_out_of_office) {
    const until = providerDetail.out_of_office_until ? new Date(`${providerDetail.out_of_office_until}T23:59:59Z`) : null;
    if (!until || startsAt <= until) {
      throw conflict(
        "provider_out_of_office",
        until
          ? `This practitioner is away until ${providerDetail.out_of_office_until}.`
          : "This practitioner is currently away.",
        until ? `Offer dates after ${providerDetail.out_of_office_until}.` : "Try again later, or contact them through messages.",
        { out_of_office_until: providerDetail.out_of_office_until },
      );
    }
  }

  // ------------------------------------------------ 1. weekly availability
  const { data: rules, error: rulesError } = await admin
    .from("availability_rules")
    .select("id, weekday, starts_time, ends_time, timezone")
    .eq("provider_id", service.provider_id);
  if (rulesError) throw rulesError;

  if (!rules || rules.length === 0) {
    throw conflict(
      "no_availability_published",
      "This practitioner has not published any availability.",
      "Hide the slot picker and offer 'message the practitioner' instead until they add availability rules.",
    );
  }

  // The *session* must fit inside a rule; buffers are the provider's own
  // problem and are not required to fit inside published hours.
  const fits = rules.some((rule) => {
    const tz = rule.timezone as string;
    const start = zonedParts(startsAt, tz);
    const end = zonedParts(endsAt, tz);
    if (start.weekday !== rule.weekday) return false;
    // A session that crosses local midnight cannot fit a single-day rule.
    if (end.date !== start.date && end.minutes !== 0) return false;
    const ruleStart = timeToMinutes(rule.starts_time as string);
    const ruleEnd = timeToMinutes(rule.ends_time as string);
    const endMinutes = end.date === start.date ? end.minutes : 1440;
    return start.minutes >= ruleStart && endMinutes <= ruleEnd;
  });

  if (!fits) {
    const sample = rules[0];
    const local = zonedParts(startsAt, sample.timezone as string);
    throw conflict(
      "outside_availability",
      `${minutesToTime(local.minutes)} on ${local.date} (${sample.timezone}) is outside this practitioner's published hours for a ${service.duration_minutes}-minute session.`,
      "Build the slot picker from `availability_rules` rather than offering a free-form time. Remember each rule carries its own timezone and the session must finish inside the window.",
      {
        duration_minutes: service.duration_minutes,
        rules: rules.map((r) => ({ weekday: r.weekday, starts_time: r.starts_time, ends_time: r.ends_time, timezone: r.timezone })),
      },
    );
  }

  // ------------------------------------------------------------ 2. blocks
  const { data: blocks, error: blocksError } = await admin
    .from("availability_blocks")
    .select("id, starts_at, ends_at, reason")
    .eq("provider_id", service.provider_id)
    .lt("starts_at", busyEnd.toISOString())
    .gt("ends_at", busyStart.toISOString());
  if (blocksError) throw blocksError;

  if (blocks && blocks.length > 0) {
    throw conflict(
      "slot_blocked",
      "The practitioner has blocked out that time.",
      "Grey the slot out. `availability_blocks` is not readable by seekers under RLS, so the picker should call an availability endpoint rather than querying it directly.",
      // Deliberately not returning `reason` — that is the provider's private
      // calendar, and 0006_rls.sql restricts the table to them for that reason.
      { blocked_from: blocks[0].starts_at, blocked_until: blocks[0].ends_at },
    );
  }

  // ---------------------------------------------------- 3. other bookings
  const { data: clashes, error: clashError } = await admin
    .from("bookings")
    .select("id, starts_at, ends_at, status")
    .eq("provider_id", service.provider_id)
    .in("status", LIVE_BOOKING_STATUSES)
    .lt("starts_at", busyEnd.toISOString())
    .gt("ends_at", busyStart.toISOString());
  if (clashError) throw clashError;

  if (clashes && clashes.length > 0) {
    const clash = clashes[0];
    throw conflict(
      "slot_taken",
      buffer > 0
        ? `That time conflicts with an existing booking (${clash.starts_at} – ${clash.ends_at}), allowing for the ${buffer}-minute buffer either side.`
        : `That time conflicts with an existing booking (${clash.starts_at} – ${clash.ends_at}).`,
      "Re-read the provider's free slots and offer the next one. Slots go stale in seconds on a popular practitioner.",
      { conflicts_with: { starts_at: clash.starts_at, ends_at: clash.ends_at } },
    );
  }

  // ------------------------------------------------ 4. seeker double-book
  const { data: ownClashes, error: ownError } = await admin
    .from("bookings")
    .select("id, reference, starts_at, ends_at")
    .eq("seeker_id", caller.userId)
    .in("status", LIVE_BOOKING_STATUSES)
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());
  if (ownError) throw ownError;

  if (ownClashes && ownClashes.length > 0) {
    throw conflict(
      "already_booked",
      `You already have booking ${ownClashes[0].reference} at that time.`,
      "Show the existing booking and offer to reschedule it instead of creating a second one.",
      { existing_booking_id: ownClashes[0].id },
    );
  }

  // ------------------------------------------------------------- money
  // Price comes from `services`, never from the request body.
  const price = service.price_cents as number;
  const currency = (service.currency as string).toUpperCase();
  const platformFee = applyBps(price, PLATFORM_FEE_BPS());
  const total = price + platformFee;
  assertChargeable(total, currency);

  const autoConfirm = !service.requires_approval;

  // ------------------------------------------------------------ booking
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .insert({
      seeker_id: caller.userId,
      provider_id: service.provider_id,
      service_id: serviceId,
      status: autoConfirm ? "confirmed" : "requested",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      timezone: displayTimezone ?? caller.profile.timezone ?? "UTC",
      // Snapshot. Policy §2.3 — terms not shown before payment are not binding,
      // so the terms in force at booking time are the ones that stick.
      cancellation_window_hours: service.cancellation_window_hours,
      rail: "stripe",
      currency,
      total_cents: total,
      platform_fee_cents: platformFee,
      seeker_note: seekerNote,
      confirmed_at: autoConfirm ? new Date().toISOString() : null,
    })
    .select("id, reference, status, starts_at, ends_at, timezone, cancellation_window_hours, total_cents, currency")
    .single();
  if (bookingError) {
    // 23P01 = exclusion_violation, raised by the GiST constraints in migration
    // 0010 when two requests race for the same slot. The checks above are
    // check-then-insert and therefore not atomic, so this is the ONLY thing
    // that actually prevents a double booking — and it is a normal outcome of
    // a race, not a server fault.
    //
    // Rethrowing the raw Postgres error produced a 500, which the client maps
    // to `unknown` / not-retryable — indistinguishable from a broken server,
    // so the loser of the race saw "something went wrong" over a slot list it
    // never refreshed. Migration 0010's own comment asks for a 409 here.
    if ((bookingError as { code?: string }).code === "23P01") {
      const clashedOnSeeker = String(bookingError.message ?? "").includes("seeker");
      throw conflict(
        clashedOnSeeker ? "seeker_slot_taken" : "slot_taken",
        clashedOnSeeker
          ? "You already have a booking at that time."
          : "That time was just booked by someone else.",
        "Refresh the slot list and pick another time — this is a race, so the slot is genuinely gone.",
      );
    }
    throw bookingError;
  }

  const cancelDeadline = new Date(startsAt.getTime() - (service.cancellation_window_hours as number) * 3_600_000);

  // -------------------------------------------------------- free short-path
  if (total === 0) {
    await notifyUser(admin, {
      profileId: service.provider_id as string,
      kind: autoConfirm ? "booking_confirmed" : "booking_requested",
      title: autoConfirm ? "New booking" : "New booking request",
      body: `${caller.profile.display_name} booked "${service.title}" for ${startsAt.toISOString()}.`,
      deepLink: deepLink(`booking/${booking.id}`),
      payload: { booking_id: booking.id, service_id: serviceId },
      dedupeKey: `booking_created:${booking.id}`,
    });
    return json({
      booking_id: booking.id,
      reference: booking.reference,
      status: booking.status,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      requires_approval: service.requires_approval,
      cancellation_window_hours: booking.cancellation_window_hours,
      free_cancellation_until: cancelDeadline.toISOString(),
      amounts: { price_cents: price, platform_fee_cents: platformFee, total_cents: total, currency },
      free: true,
      payment: null,
    }, 201);
  }

  // ------------------------------------------------------- payment bypass
  if (paymentBypassEnabled()) {
    await admin.from("bookings").update({ payment_bypassed: true }).eq("id", booking.id);
    console.warn(
      `PAYMENT BYPASS: booking ${booking.reference} completed for ${total} ${currency} with NO payment taken.`,
    );
    return json({
      booking_id: booking.id,
      reference: booking.reference,
      status: booking.status,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      amounts: { total_cents: total, currency },
      cancellation_window_hours: booking.cancellation_window_hours,
      payment: null,
      payment_bypassed: true,
      notice: "Test mode: no payment was taken. This booking is not revenue.",
    }, 201);
  }

  // ------------------------------------------------------------- stripe
  //
  // `stripeClient()` THROWS synchronously when STRIPE_SECRET_KEY is unset — it
  // does not return a rejected promise. Calling it outside this try meant the
  // throw sailed past the `.catch()` below, so the compensating cancel never
  // ran: the booking stayed `confirmed`, the slot stayed consumed, the seeker
  // got a 500 and was never told a booking existed. Retrying then answered
  // "you already have a booking at that time" for a booking they had never
  // seen. Verified live before this fix.
  //
  // Anything that can leave the row behind now releases it first.
  let stripe: ReturnType<typeof stripeClient>;
  try {
    stripe = stripeClient();
  } catch (err) {
    await releaseBooking(admin, booking.id);
    throw err;
  }

  const intent = await stripe.paymentIntents
    .create(
      {
        amount: total,
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          kind: "booking",
          booking_id: booking.id,
          booking_reference: booking.reference,
          service_id: serviceId,
          provider_id: service.provider_id as string,
          seeker_id: caller.userId,
          platform,
        },
        description: `MSN booking ${booking.reference} — ${service.title}`,
        receipt_email: caller.profile.email ?? undefined,
      },
      { idempotencyKey: `booking:${booking.id}` },
    )
    .catch(async (err) => {
      await releaseBooking(admin, booking.id);
      return translateStripeError(err);
    });

  const { error: linkError } = await admin
    .from("bookings")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", booking.id);
  if (linkError) throw linkError;

  return json({
    booking_id: booking.id,
    reference: booking.reference,
    status: booking.status,
    starts_at: booking.starts_at,
    ends_at: booking.ends_at,
    timezone: booking.timezone,
    requires_approval: service.requires_approval,
    cancellation_window_hours: booking.cancellation_window_hours,
    free_cancellation_until: cancelDeadline.toISOString(),
    amounts: { price_cents: price, platform_fee_cents: platformFee, total_cents: total, currency },
    free: false,
    payment: {
      provider: "stripe",
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      publishable_key: Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? null,
    },
  }, 201);
}));
