import type { PostgrestError } from '@supabase/supabase-js';

import { AppError, fromPostgrestError } from '@/lib/errors';
import { escapeForOrIlike, rangeFor, unwrap, unwrapMaybe } from '@/lib/queries/client';
import { qk } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';
import type {
  EventRow,
  Message,
  Profile,
  ProfileUpdate,
  Report,
  ReportOutcome,
  Service,
} from '@/types/database';

/**
 * Database calls for the admin people / verification / moderation screens.
 *
 * TODO(agent · admin): move every function below into `src/lib/queries/` —
 * profile and report reads into `profiles.ts` and a new `reports.ts`, the keys
 * into `keys.ts` — and delete this file. They live here only because this pass
 * does not own `src/lib/`. They are written exactly as they would be there
 * (`unwrap`, a lowercase verb-phrase context, a thrown `AppError`), so the move
 * is a cut and paste, and screens still never touch `supabase.from(...)`.
 *
 * What is missing upstream and why each of these has to exist:
 *
 *  - `searchProviders` filters `is_suspended = false` and excludes seekers.
 *    Both are right for Discover and wrong here: the operator's whole job is
 *    the accounts the marketplace is hiding, and a seeker can be reported too.
 *  - There is no write path for `is_verified` / `is_certified` / `is_suspended`
 *    anywhere in the app. `updateProfile` exists but is documented as the
 *    signed-in user's own profile and explicitly warns against passing the
 *    trust flags. This is the only legitimate path, so it is spelt out as three
 *    named decisions rather than a generic patch.
 *  - `reports` has no query module at all.
 *  - Listing search is host-aware, which Discover's `searchEvents` (a ranked
 *    full-text RPC over published events only) cannot be — the operator needs
 *    drafts and paused services too.
 */

// -----------------------------------------------------------------------------
// Keys
// -----------------------------------------------------------------------------

/**
 * Keys are suffixed onto the existing `qk` prefixes wherever one exists, so
 * `invalidateQueries({ queryKey: qk.profiles.all })` still reaches them and a
 * suspension made here clears the public profile cache too.
 *
 * `reports` has no prefix in `qk`, so one is spelt out. It is the shape the
 * entry in `keys.ts` should take.
 */
export const adminKeys = {
  people: {
    search: (term: string) => [...qk.profiles.all, 'admin', 'search', term] as const,
    activity: (profileId: string) => [...qk.profiles.detail(profileId), 'admin', 'activity'] as const,
    evidence: (profileId: string) => [...qk.profiles.detail(profileId), 'admin', 'evidence'] as const,
  },
  reports: {
    all: ['reports'] as const,
    detail: (reportId: string) => ['reports', 'detail', reportId] as const,
    subject: (reportId: string) => ['reports', 'detail', reportId, 'subject'] as const,
    messageContext: (reportId: string) => ['reports', 'detail', reportId, 'context'] as const,
    prior: (reportId: string) => ['reports', 'detail', reportId, 'prior'] as const,
  },
  listings: {
    events: (term: string) => [...qk.events.all, 'admin', 'search', term] as const,
    services: (term: string) => [...qk.services.all, 'admin', 'search', term] as const,
  },
} as const;

// -----------------------------------------------------------------------------
// Shared shapes
// -----------------------------------------------------------------------------

/** The columns needed to name a person in a row or a header. */
export type PersonRef = Pick<
  Profile,
  'id' | 'display_name' | 'handle' | 'avatar_url' | 'account_type' | 'is_verified' | 'is_suspended'
>;

const PERSON_REF_COLUMNS = 'id, display_name, handle, avatar_url, account_type, is_verified, is_suspended';

/**
 * `min_price_cents` is a generated column (migration 0013) and PostgREST does
 * not include those in `*`, while `EventRow` does — so every event select has
 * to name it or the row comes back missing a field the type promises.
 */
const EVENT_COLUMNS = '*, min_price_cents';

/**
 * `unwrap` for a `head: true` count query. Those return `data: null` with the
 * total in `count`, which `unwrap` would read as "no row" and throw on.
 */
async function countRows(
  builder: PromiseLike<{ count: number | null; error: PostgrestError | null }>,
  context: string,
): Promise<number> {
  const { count, error } = await builder;
  if (error) throw fromPostgrestError(error, context);
  return count ?? 0;
}

// -----------------------------------------------------------------------------
// Find someone
// -----------------------------------------------------------------------------

/**
 * One field over display name, handle and email.
 *
 * No unfiltered branch on purpose: an empty term returns nothing rather than
 * the first page of every account. This is a search box, not a table browser —
 * the operator arrives here already knowing who they want.
 *
 * Suspended accounts are included; RLS lets an admin read them
 * (`not is_suspended or id = auth.uid() or auth_is_admin()`) and hiding them
 * would hide exactly the accounts most likely to be looked up.
 */
export async function searchPeople(term: string, page = 0): Promise<Profile[]> {
  const safe = escapeForOrIlike(term);
  if (safe.length === 0) return [];

  const [from, to] = rangeFor(page);
  return unwrap(
    supabase
      .from('profiles')
      .select('*')
      .or(`display_name.ilike.%${safe}%,handle.ilike.%${safe}%,email.ilike.%${safe}%`)
      // Suspended first: if the operator searched a name that turns out to be
      // suspended, that is the fact they needed.
      .order('is_suspended', { ascending: false })
      .order('display_name')
      .range(from, to),
    'search accounts',
  );
}

// -----------------------------------------------------------------------------
// One account — activity
// -----------------------------------------------------------------------------

export interface AccountActivity {
  bookingsAsSeeker: number;
  bookingsAsProvider: number;
  completedAsProvider: number;
  /**
   * Requested or confirmed bookings in the future, on either side.
   *
   * This is the number that matters before a suspension: suspending hides the
   * account but does not touch its bookings, and every one of these still
   * blocks that person's calendar and still shows on the other party's.
   */
  upcomingBookings: number;
  ordersPlaced: number;
  eventsHosted: number;
  eventsPublished: number;
  servicesListed: number;
  servicesActive: number;
  reviewsReceived: number;
}

/**
 * Counts only. The operator is deciding about an account, not auditing it, and
 * a page of every booking would bury the three numbers that inform the call.
 */
export async function getAccountActivity(profileId: string): Promise<AccountActivity> {
  const nowIso = new Date().toISOString();
  const head = { count: 'exact', head: true } as const;

  const [
    bookingsAsSeeker,
    bookingsAsProvider,
    completedAsProvider,
    upcomingBookings,
    ordersPlaced,
    eventsHosted,
    eventsPublished,
    servicesListed,
    servicesActive,
    reviewsReceived,
  ] = await Promise.all([
    countRows(
      supabase.from('bookings').select('id', head).eq('seeker_id', profileId),
      'count their bookings',
    ),
    countRows(
      supabase.from('bookings').select('id', head).eq('provider_id', profileId),
      'count their bookings',
    ),
    countRows(
      supabase
        .from('bookings')
        .select('id', head)
        .eq('provider_id', profileId)
        .eq('status', 'completed'),
      'count their completed sessions',
    ),
    countRows(
      supabase
        .from('bookings')
        .select('id', head)
        .or(`seeker_id.eq.${profileId},provider_id.eq.${profileId}`)
        .in('status', ['requested', 'confirmed'])
        .gt('starts_at', nowIso),
      'count their upcoming bookings',
    ),
    countRows(
      supabase.from('orders').select('id', head).eq('buyer_id', profileId).eq('status', 'paid'),
      'count their orders',
    ),
    countRows(
      supabase.from('events').select('id', head).eq('host_id', profileId),
      'count their events',
    ),
    countRows(
      supabase
        .from('events')
        .select('id', head)
        .eq('host_id', profileId)
        .eq('status', 'published'),
      'count their events',
    ),
    countRows(
      supabase.from('services').select('id', head).eq('provider_id', profileId),
      'count their services',
    ),
    countRows(
      supabase
        .from('services')
        .select('id', head)
        .eq('provider_id', profileId)
        .eq('is_active', true),
      'count their services',
    ),
    countRows(
      supabase
        .from('reviews')
        .select('id', head)
        .eq('subject_id', profileId)
        .eq('is_hidden', false),
      'count their reviews',
    ),
  ]);

  return {
    bookingsAsSeeker,
    bookingsAsProvider,
    completedAsProvider,
    upcomingBookings,
    ordersPlaced,
    eventsHosted,
    eventsPublished,
    servicesListed,
    servicesActive,
    reviewsReceived,
  };
}

// -----------------------------------------------------------------------------
// One account — the decisions
// -----------------------------------------------------------------------------

/**
 * `guard_profile_trust_flags` reverts these columns for anyone who is not an
 * admin, and it does so **silently** — the UPDATE succeeds, the row comes back
 * with the old value, and nothing tells the caller the change did not happen.
 *
 * So every write here reads the returned row back and throws when the flag did
 * not move. Without that check the screen would show a confirmation for a
 * verification that never landed, which is the worst possible failure for the
 * badge the whole marketplace trusts.
 */
async function setTrustFlag(
  profileId: string,
  column: 'is_verified' | 'is_certified' | 'is_suspended',
  value: boolean,
  context: string,
): Promise<Profile> {
  // Spelt out rather than `{ [column]: value }`: a computed key widens to
  // `Record<string, boolean>`, which PostgREST's generated Update type rejects
  // outright — and the widening is exactly what would let a typo through.
  const patch: ProfileUpdate =
    column === 'is_verified'
      ? { is_verified: value }
      : column === 'is_certified'
        ? { is_certified: value }
        : { is_suspended: value };

  const row = await unwrap(
    supabase.from('profiles').update(patch).eq('id', profileId).select('*').single(),
    context,
  );

  if (row[column] !== value) {
    throw new AppError(
      'forbidden',
      'The database refused that change. Only an admin account can set this.',
      { retryable: false, code: '42501' },
    );
  }
  return row;
}

export function setAccountVerified(profileId: string, isVerified: boolean): Promise<Profile> {
  return setTrustFlag(profileId, 'is_verified', isVerified, 'change their verification');
}

export function setAccountCertified(profileId: string, isCertified: boolean): Promise<Profile> {
  return setTrustFlag(profileId, 'is_certified', isCertified, 'change their certification');
}

/**
 * Suspending flips one boolean, and that boolean is what
 * `profiles are publicly readable` keys on — so the account, and everything
 * that joins to it, drops out of the marketplace.
 *
 * It does NOT cancel bookings, refund orders, unpublish events or sign them
 * out. Those are separate decisions and the screen says so before confirming.
 */
export function setAccountSuspended(profileId: string, isSuspended: boolean): Promise<Profile> {
  return setTrustFlag(
    profileId,
    'is_suspended',
    isSuspended,
    isSuspended ? 'suspend that account' : 'lift that suspension',
  );
}

// -----------------------------------------------------------------------------
// Verification evidence
// -----------------------------------------------------------------------------

/** A review with the name of who left it. Admins can read hidden ones. */
export interface EvidenceReview {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  is_hidden: boolean;
  author: Pick<Profile, 'id' | 'display_name'> | null;
}

/**
 * Everything the operator is being asked to vouch for, in one call.
 *
 * The Verified badge is the marketplace's whole trust signal, so this screen
 * has to show the substance behind it rather than a switch. A practitioner
 * with no listings, no reviews and no completed sessions should be visibly
 * that, not a toggle away from carrying the same badge as someone with fifty.
 */
export interface VerificationEvidence {
  events: EventRow[];
  services: Service[];
  reviews: EvidenceReview[];
  rating: { average: number | null; total: number };
}

const EVIDENCE_LIMIT = 5;

export async function getVerificationEvidence(profileId: string): Promise<VerificationEvidence> {
  const [events, services, reviews, ratingRows] = await Promise.all([
    unwrap(
      supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('host_id', profileId)
        .order('starts_at', { ascending: false })
        .limit(EVIDENCE_LIMIT),
      'load their events',
    ),
    unwrap(
      supabase
        .from('services')
        .select('*')
        .eq('provider_id', profileId)
        .order('is_active', { ascending: false })
        .order('price_cents')
        .limit(EVIDENCE_LIMIT),
      'load their services',
    ),
    unwrap(
      supabase
        .from('reviews')
        .select('id, rating, body, created_at, is_hidden, author:profiles!reviews_author_id_fkey(id, display_name)')
        .eq('subject_id', profileId)
        .order('created_at', { ascending: false })
        .limit(EVIDENCE_LIMIT)
        .returns<EvidenceReview[]>(),
      'load their reviews',
    ),
    unwrap(supabase.rpc('provider_rating', { p_profile: profileId }), 'load their rating'),
  ]);

  return {
    events,
    services,
    reviews,
    rating: ratingRows[0] ?? { average: null, total: 0 },
  };
}

// -----------------------------------------------------------------------------
// One report
// -----------------------------------------------------------------------------

export type ReportWithParties = Report & {
  reporter: PersonRef | null;
  /** The admin who closed it. Null while the report is open. */
  resolver: Pick<Profile, 'id' | 'display_name'> | null;
};

export async function getReport(reportId: string): Promise<ReportWithParties | null> {
  return unwrapMaybe(
    supabase
      .from('reports')
      .select(
        `*,
         reporter:profiles!reports_reporter_id_fkey(${PERSON_REF_COLUMNS}),
         resolver:profiles!reports_resolved_by_fkey(id, display_name)`,
      )
      .eq('id', reportId)
      .maybeSingle()
      .returns<ReportWithParties | null>(),
    'load that report',
  );
}

export type ReportedMessage = Message & { sender: PersonRef | null };
export type ReportedEvent = EventRow & { host: PersonRef | null };

/**
 * The reported thing, fetched in whichever shape the report points at.
 *
 * `report_targets_one_thing` guarantees exactly one of the three subject
 * columns is set, so this is a closed set — but `missing` is still a real
 * outcome: every subject FK is `on delete cascade` for the row itself, while a
 * message can be soft-deleted (`deleted_at`) and still be the thing that was
 * reported. Deciding on a report whose subject is gone is a legitimate case.
 */
export type ReportSubject =
  | { kind: 'profile'; profile: Profile }
  | { kind: 'event'; event: ReportedEvent }
  | { kind: 'message'; message: ReportedMessage }
  | { kind: 'missing' };

export async function getReportSubject(report: Report): Promise<ReportSubject> {
  if (report.subject_profile_id !== null) {
    const profile = await unwrapMaybe(
      supabase.from('profiles').select('*').eq('id', report.subject_profile_id).maybeSingle(),
      'load the reported account',
    );
    return profile ? { kind: 'profile', profile } : { kind: 'missing' };
  }

  if (report.subject_event_id !== null) {
    const event = await unwrapMaybe(
      supabase
        .from('events')
        .select(`${EVENT_COLUMNS}, host:profiles!events_host_id_fkey(${PERSON_REF_COLUMNS})`)
        .eq('id', report.subject_event_id)
        .maybeSingle()
        .returns<ReportedEvent | null>(),
      'load the reported event',
    );
    return event ? { kind: 'event', event } : { kind: 'missing' };
  }

  if (report.subject_message_id !== null) {
    // Admins can read any message (`participants read messages` ORs in
    // `auth_is_admin()`), which is the only reason moderating a DM is possible
    // at all.
    const message = await unwrapMaybe(
      supabase
        .from('messages')
        .select(`*, sender:profiles!messages_sender_id_fkey(${PERSON_REF_COLUMNS})`)
        .eq('id', report.subject_message_id)
        .maybeSingle()
        .returns<ReportedMessage | null>(),
      'load the reported message',
    );
    return message ? { kind: 'message', message } : { kind: 'missing' };
  }

  return { kind: 'missing' };
}

/**
 * The messages either side of a reported one, oldest first, with the reported
 * message in the middle.
 *
 * A single line lifted out of a conversation is close to unjudgeable — "fine,
 * whatever" is a shrug or a threat depending on what came before it. Reading
 * the neighbours is the difference between moderating a message and moderating
 * a screenshot.
 *
 * Two queries rather than one window function, because PostgREST has no
 * `lag`/`lead` and the alternative is fetching the whole thread.
 */
export async function getMessageContext(
  message: ReportedMessage,
  span = 3,
): Promise<ReportedMessage[]> {
  const select = `*, sender:profiles!messages_sender_id_fkey(${PERSON_REF_COLUMNS})`;

  const [before, after] = await Promise.all([
    unwrap(
      supabase
        .from('messages')
        .select(select)
        .eq('conversation_id', message.conversation_id)
        .lt('created_at', message.created_at)
        .order('created_at', { ascending: false })
        .limit(span)
        .returns<ReportedMessage[]>(),
      'load the surrounding messages',
    ),
    unwrap(
      supabase
        .from('messages')
        .select(select)
        .eq('conversation_id', message.conversation_id)
        .gt('created_at', message.created_at)
        .order('created_at', { ascending: true })
        .limit(span)
        .returns<ReportedMessage[]>(),
      'load the surrounding messages',
    ),
  ]);

  return [...before.reverse(), message, ...after];
}

/**
 * Closes a report. Stamps who and when, which is the audit trail — there is no
 * outcome column on `reports`, so "dismissed" and "acted on" are
 * indistinguishable afterwards. See the TODO in `reports/[id].tsx`.
 */
/**
 * Close a report, on the record.
 *
 * `outcome` is not optional, and that is the point. Stamping `resolved_at`
 * alone said only that somebody looked — it could not distinguish "we suspended
 * this practitioner" from "we looked and there was nothing here". The second
 * report about the same account is exactly when that difference matters, and it
 * was gone by then. A database check constraint enforces the same rule, so a
 * resolution written any other way is rejected rather than silently blank.
 *
 * `note` is internal. It is written for the next moderator, never shown to the
 * reporter or the person reported.
 */
export async function resolveReport(
  reportId: string,
  adminId: string,
  outcome: ReportOutcome,
  note?: string,
): Promise<Report> {
  return unwrap(
    supabase
      .from('reports')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: adminId,
        outcome,
        resolution_note: note?.trim() ? note.trim() : null,
      })
      .eq('id', reportId)
      .select('*')
      .single(),
    'resolve that report',
  );
}

export interface PriorReport {
  id: string;
  created_at: string;
  reason: string;
  outcome: ReportOutcome | null;
  resolution_note: string | null;
}

/**
 * Reports already closed about this same person, newest first.
 *
 * This is the reason `outcome` exists. One report is an allegation; the third
 * upheld one is a pattern, and three dismissed ones may say more about the
 * reporter than the reported. A moderator judging in isolation cannot see
 * either. `excludeId` keeps the report being read out of its own history.
 */
export async function listPriorReports(
  subjectProfileId: string,
  excludeId: string,
): Promise<PriorReport[]> {
  return unwrap(
    supabase
      .from('reports')
      .select('id, created_at, reason, outcome, resolution_note')
      .eq('subject_profile_id', subjectProfileId)
      .not('resolved_at', 'is', null)
      .neq('id', excludeId)
      .order('resolved_at', { ascending: false })
      .limit(5),
    'load earlier reports',
  );
}

// -----------------------------------------------------------------------------
// Find a listing
// -----------------------------------------------------------------------------

/**
 * Profile ids whose name or handle matches, so a listing search can be "by
 * host" as well as "by title".
 *
 * Resolved as a separate query for the same reason `searchProviders` resolves
 * speciality ids first: PostgREST cannot put an embedded column inside a
 * top-level `or=()` without an inner join that changes the row shape.
 */
async function hostIdsMatching(safeTerm: string): Promise<string[]> {
  const rows = await unwrap(
    supabase
      .from('profiles')
      .select('id')
      .or(`display_name.ilike.%${safeTerm}%,handle.ilike.%${safeTerm}%`)
      .limit(50),
    'search hosts',
  );
  return rows.map((row) => row.id);
}

export type AdminEvent = EventRow & { host: PersonRef | null };
export type AdminService = Service & { provider: PersonRef | null };

/**
 * Every event, drafts and cancelled ones included — RLS gives an admin the lot
 * (`status = 'published' or host_id = auth.uid() or auth_is_admin()`).
 *
 * Deliberately not `searchEvents`: that RPC ranks published events for a
 * seeker, and the listing an operator is hunting for is often the one that has
 * already been pulled.
 */
export async function searchAdminEvents(term: string, page = 0): Promise<AdminEvent[]> {
  const safe = escapeForOrIlike(term);
  if (safe.length === 0) return [];

  const hostIds = await hostIdsMatching(safe);
  const [from, to] = rangeFor(page);

  const filters = [`title.ilike.%${safe}%`];
  if (hostIds.length > 0) filters.push(`host_id.in.(${hostIds.join(',')})`);

  return unwrap(
    supabase
      .from('events')
      .select(`${EVENT_COLUMNS}, host:profiles!events_host_id_fkey(${PERSON_REF_COLUMNS})`)
      .or(filters.join(','))
      .order('starts_at', { ascending: false })
      .range(from, to)
      .returns<AdminEvent[]>(),
    'search events',
  );
}

export async function searchAdminServices(term: string, page = 0): Promise<AdminService[]> {
  const safe = escapeForOrIlike(term);
  if (safe.length === 0) return [];

  const providerIds = await hostIdsMatching(safe);
  const [from, to] = rangeFor(page);

  const filters = [`title.ilike.%${safe}%`];
  if (providerIds.length > 0) filters.push(`provider_id.in.(${providerIds.join(',')})`);

  return unwrap(
    supabase
      .from('services')
      .select(`*, provider:profiles!services_provider_id_fkey(${PERSON_REF_COLUMNS})`)
      .or(filters.join(','))
      .order('is_active', { ascending: false })
      .order('title')
      .range(from, to)
      .returns<AdminService[]>(),
    'search services',
  );
}

/**
 * Takes an event off the marketplace by returning it to draft.
 *
 * Draft rather than `cancelled` or `archived`, for two reasons. It is the only
 * one the host can undo themselves once whatever was wrong is fixed, and
 * `cancelEvent` carries an unfinished refund obligation (see its TODO) that an
 * unpublish must not silently inherit.
 *
 * `published_at` is deliberately left in place — it is the record that this was
 * live once, and `events_published_has_timestamp` only constrains the
 * published direction.
 *
 * This does not refund or notify anybody who already bought a ticket. The
 * screen says so before confirming.
 */
export async function unpublishEvent(eventId: string): Promise<EventRow> {
  return unwrap(
    supabase.from('events').update({ status: 'draft' }).eq('id', eventId).select('*').single(),
    'unpublish that event',
  );
}

/** Tickets sold across an event's tiers — what an unpublish leaves stranded. */
export async function ticketsSoldForEvent(eventId: string): Promise<number> {
  const rows = await unwrap(
    supabase
      .from('ticket_types')
      .select('quantity_sold')
      .eq('event_id', eventId)
      .returns<{ quantity_sold: number }[]>(),
    'count tickets sold',
  );
  return rows.reduce((total, row) => total + row.quantity_sold, 0);
}
