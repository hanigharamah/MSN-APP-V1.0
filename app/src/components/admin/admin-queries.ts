import { AppError, type AppErrorKind } from '@/lib/errors';
import { unwrap, unwrapMaybe } from '@/lib/queries/client';
import { qk } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';
import type { AccountType, PaymentRail, RefundStatus } from '@/types/database';

/**
 * Database and Edge Function calls for the admin queue and the refund
 * decision.
 *
 * TODO(agent · admin): move every function below into `src/lib/queries/` — a
 * new `refunds.ts` plus the queue reads — and the keys into `keys.ts`, then
 * delete this file. They live here only because this pass does not own
 * `src/lib/`. They are written exactly as they would be there (`unwrap`, a
 * lowercase verb-phrase context, a thrown `AppError`), so the move is a cut and
 * paste and screens still never touch `supabase.from(...)` themselves.
 *
 * What is missing upstream and why each of these has to exist:
 *
 *  - `listMyRefundRequests` is scoped to one requester and returns bare rows.
 *    The operator needs every open request across all requesters, with the
 *    thing that was bought attached — a queue of bare `refund_requests` rows is
 *    a list of uuids and a reason, which is not enough to decide anything.
 *  - `getOrder` embeds only the event. Deciding a refund needs the buyer, the
 *    host, the rail, the payment intent and `payment_bypassed`.
 *  - There is no `reports` module at all, and no read for practitioners
 *    awaiting verification — `searchProviders` deliberately excludes them.
 *  - `process-refund` has no client binding anywhere.
 *
 * TODO(agent · types): `orders.payment_bypassed` and `bookings.payment_bypassed`
 * exist in the live database (migration `0018_payment_bypass_marker.sql`,
 * confirmed against project `esmotmpsjnvuglrtbjpf`) but are absent from the
 * generated `src/types/database.ts` — it predates that migration. Every row
 * shape below therefore declares the column by hand and the selects name it
 * explicitly. Regenerate with `supabase gen types typescript --linked` and the
 * hand-written column can go.
 */

// -----------------------------------------------------------------------------
// Keys
// -----------------------------------------------------------------------------

/**
 * The queue is three queries, not one, and the keys are suffixed onto the
 * existing `qk` prefixes wherever one exists.
 *
 * That is the whole reason they are shaped this way: the pass that owns
 * `/(admin)/reports/[id]` and `/(admin)/people/[id]` resolves reports and flips
 * `is_verified` from its own screens. Its
 * `invalidateQueries({ queryKey: qk.profiles.all })` and its `['reports']`
 * prefix both reach these, so a decision made over there empties the row over
 * here without either pass importing the other's key.
 *
 * `reports` has no prefix in `qk` — the literal below is the shape the entry in
 * `keys.ts` should take, and matches the one the people pass spells out.
 */
export const adminQueueKeys = {
  refunds: {
    pending: [...qk.refunds.all, 'admin', 'pending'] as const,
    detail: (refundId: string) => [...qk.refunds.detail(refundId), 'admin'] as const,
  },
  reports: {
    open: ['reports', 'admin', 'open'] as const,
  },
  verification: {
    pending: [...qk.profiles.all, 'admin', 'awaiting-verification'] as const,
  },
} as const;

// -----------------------------------------------------------------------------
// Shared shapes
// -----------------------------------------------------------------------------

/** Just enough to name a person and put a face next to them. */
export interface AdminPersonRef {
  id: string;
  display_name: string;
  avatar_url: string | null;
  handle: string | null;
}

const PERSON_REF = 'id, display_name, avatar_url, handle';

// -----------------------------------------------------------------------------
// Refunds — the queue
// -----------------------------------------------------------------------------

/**
 * What was bought, reduced to the four things that change the decision: how it
 * was paid for, whether any money actually moved, how much, and what it was.
 */
export interface RefundSubjectSummary {
  reference: string;
  currency: string;
  total_cents: number;
  rail: PaymentRail;
  payment_bypassed: boolean;
  /** Event title or service title. Null if the row it hung off is gone. */
  title: string | null;
}

export interface PendingRefund {
  id: string;
  created_at: string;
  /** What they are claiming. Null means "all of it". */
  amount_cents: number | null;
  reason: string;
  requester: AdminPersonRef | null;
  /** Exactly one of these is set — `refund_targets_one_thing` guarantees it. */
  order: RefundSubjectSummary | null;
  booking: RefundSubjectSummary | null;
}

interface RawRefundQueueRow {
  id: string;
  created_at: string;
  amount_cents: number | null;
  reason: string;
  requester: AdminPersonRef | null;
  order:
    | (Omit<RefundSubjectSummary, 'title'> & { event: { title: string } | null })
    | null;
  booking:
    | (Omit<RefundSubjectSummary, 'title'> & { service: { title: string } | null })
    | null;
}

const REFUND_SUBJECT_COLUMNS = 'reference, currency, total_cents, rail, payment_bypassed';

/**
 * Every refund still awaiting a decision, oldest first.
 *
 * Not paginated. A queue that needs a second page is a queue that has already
 * failed — and `status = 'requested'` is by definition the small set. If this
 * ever returns hundreds, the fix is staffing, not `useInfiniteQuery`.
 */
export async function listPendingRefunds(): Promise<PendingRefund[]> {
  const rows = await unwrap(
    supabase
      .from('refund_requests')
      .select(
        `id, created_at, amount_cents, reason,
         requester:profiles!refund_requests_requester_id_fkey(${PERSON_REF}),
         order:orders(${REFUND_SUBJECT_COLUMNS}, event:events(title)),
         booking:bookings(${REFUND_SUBJECT_COLUMNS}, service:services(title))`,
      )
      .eq('status', 'requested')
      .order('created_at', { ascending: true })
      .returns<RawRefundQueueRow[]>(),
    'load the refund queue',
  );

  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    amount_cents: row.amount_cents,
    reason: row.reason,
    requester: row.requester,
    order: row.order ? { ...row.order, title: row.order.event?.title ?? null } : null,
    booking: row.booking ? { ...row.booking, title: row.booking.service?.title ?? null } : null,
  }));
}

// -----------------------------------------------------------------------------
// Refunds — the decision
// -----------------------------------------------------------------------------

/** The order behind a refund, with everything the decision turns on. */
export interface RefundOrderContext {
  id: string;
  reference: string;
  status: string;
  rail: PaymentRail;
  currency: string;
  total_cents: number;
  payment_bypassed: boolean;
  stripe_payment_intent_id: string | null;
  store_transaction_id: string | null;
  purchased_at: string | null;
  created_at: string;
  event: {
    id: string;
    title: string;
    starts_at: string;
    timezone: string;
    status: string;
    host: AdminPersonRef | null;
  } | null;
}

/** The booking behind a refund. Same idea, different table. */
export interface RefundBookingContext {
  id: string;
  reference: string;
  status: string;
  rail: PaymentRail;
  currency: string;
  total_cents: number;
  payment_bypassed: boolean;
  stripe_payment_intent_id: string | null;
  store_transaction_id: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  cancellation_window_hours: number;
  seeker_note: string | null;
  created_at: string;
  service: { id: string; title: string; duration_minutes: number } | null;
  provider: AdminPersonRef | null;
}

export interface RefundForDecision {
  id: string;
  status: RefundStatus;
  created_at: string;
  reason: string;
  amount_cents: number | null;
  acknowledged_at: string | null;
  decided_at: string | null;
  processed_at: string | null;
  decision_note: string | null;
  requester: AdminPersonRef | null;
  decided_by: AdminPersonRef | null;
  order: RefundOrderContext | null;
  booking: RefundBookingContext | null;
}

/**
 * One refund request with everything needed to decide it in one round trip.
 *
 * Deliberately one query rather than a request plus a lazy "load the order":
 * the operator cannot decide without the order, so fetching it separately only
 * buys a screen that renders half a decision.
 *
 * `null` is a real answer — RLS hides nothing from an admin, so a miss means
 * the row is genuinely gone and the screen should say "not found", not error.
 */
export async function getRefundForDecision(refundId: string): Promise<RefundForDecision | null> {
  return unwrapMaybe(
    supabase
      .from('refund_requests')
      .select(
        `id, status, created_at, reason, amount_cents, acknowledged_at, decided_at,
         processed_at, decision_note,
         requester:profiles!refund_requests_requester_id_fkey(${PERSON_REF}),
         decided_by:profiles!refund_requests_decided_by_fkey(${PERSON_REF}),
         order:orders(
           id, reference, status, rail, currency, total_cents, payment_bypassed,
           stripe_payment_intent_id, store_transaction_id, purchased_at, created_at,
           event:events(
             id, title, starts_at, timezone, status,
             host:profiles!events_host_id_fkey(${PERSON_REF})
           )
         ),
         booking:bookings(
           id, reference, status, rail, currency, total_cents, payment_bypassed,
           stripe_payment_intent_id, store_transaction_id, starts_at, ends_at, timezone,
           cancellation_window_hours, seeker_note, created_at,
           service:services(id, title, duration_minutes),
           provider:profiles!bookings_provider_id_fkey(${PERSON_REF})
         )`,
      )
      .eq('id', refundId)
      .maybeSingle()
      .returns<RefundForDecision | null>(),
    'load that refund request',
  );
}

// -----------------------------------------------------------------------------
// Reports — the queue
// -----------------------------------------------------------------------------

export interface OpenReport {
  id: string;
  created_at: string;
  reason: string;
  detail: string | null;
  reporter: AdminPersonRef | null;
  subject_profile: AdminPersonRef | null;
  subject_event: { id: string; title: string } | null;
  subject_message_id: string | null;
}

/**
 * Every unresolved report, oldest first.
 *
 * `subject_message_id` comes back as a bare id: reading the message itself
 * needs the conversation around it to mean anything, and that belongs on the
 * report screen, which another pass owns. The queue only has to say "a
 * message was reported".
 */
export async function listOpenReports(): Promise<OpenReport[]> {
  return unwrap(
    supabase
      .from('reports')
      .select(
        `id, created_at, reason, detail, subject_message_id,
         reporter:profiles!reports_reporter_id_fkey(${PERSON_REF}),
         subject_profile:profiles!reports_subject_profile_id_fkey(${PERSON_REF}),
         subject_event:events(id, title)`,
      )
      .is('resolved_at', null)
      .order('created_at', { ascending: true })
      .returns<OpenReport[]>(),
    'load open reports',
  );
}

// -----------------------------------------------------------------------------
// Verification — the queue
// -----------------------------------------------------------------------------

export interface AwaitingVerification {
  id: string;
  display_name: string;
  avatar_url: string | null;
  handle: string | null;
  account_type: AccountType;
  created_at: string;
  city: string | null;
  country_code: string | null;
}

/**
 * Accounts that can sell but have not been verified.
 *
 * `account_type <> 'seeker'` rather than `isProviderAccount(...)`: the enum can
 * gain a member, and a new selling account type that silently never appears in
 * the verification queue is the kind of gap nobody notices for a year.
 *
 * Suspended accounts are excluded. A suspended practitioner is not waiting on
 * verification, they are waiting on an appeal, and that is a different queue
 * item on a screen this pass does not own.
 */
export async function listAwaitingVerification(): Promise<AwaitingVerification[]> {
  return unwrap(
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url, handle, account_type, created_at, city, country_code')
      .neq('account_type', 'seeker')
      .eq('is_verified', false)
      .eq('is_suspended', false)
      .order('created_at', { ascending: true })
      .returns<AwaitingVerification[]>(),
    'load accounts awaiting verification',
  );
}

// -----------------------------------------------------------------------------
// The decision itself
// -----------------------------------------------------------------------------

/**
 * Error codes `process-refund` returns that the screen reacts to by name
 * rather than by message. Everything else is rendered as its message.
 */
export const REFUND_ERROR = {
  /** `STRIPE_SECRET_KEY` is not set. No refund was created; nothing moved. */
  missingConfiguration: 'missing_configuration',
  /** The row is an Apple or Google purchase. Only the store can refund it. */
  storeRail: 'store_rail_not_refundable_by_msn',
  /** Someone else decided it first, or it was already settled. */
  alreadyDecided: 'refund_already_decided',
  /** The order is already fully refunded. */
  alreadyRefunded: 'already_refunded',
  /** Nothing for Stripe to refund against — no payment intent on the row. */
  noPaymentIntent: 'no_payment_intent',
  /** A decline arrived without a written reason. Policy §4.3. */
  noteRequired: 'decision_note_required',
} as const;

export interface RefundDecisionInput {
  refundRequestId: string;
  decision: 'approve' | 'decline';
  /** Approve only. Omitted refunds the claimed amount, or the full payment. */
  amountCents?: number;
  /**
   * Required on decline — the customer is shown this text **verbatim**, so it
   * is written to them, not about them.
   */
  decisionNote?: string;
}

/** What `process-refund` sends back. Approve and decline share the envelope. */
export interface RefundDecisionResult {
  refund_request_id: string;
  status: 'declined' | 'processed';
  /** Decline. */
  decision_note?: string | null;
  decided_at?: string;
  escalation?: string;
  /** Approve. */
  amount_cents?: number;
  amount_display?: string;
  partial?: boolean;
  stripe_refund_id?: string | null;
  subject?: string;
  processed_at?: string;
}

interface EdgeErrorBody {
  error?: { code?: string; message?: string; fix?: string };
  code?: string;
  message?: string;
}

function kindForStatus(status: number): AppErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate_limited';
  return 'unknown';
}

/**
 * Decides a refund.
 *
 * ## Everything this function is careful about
 *
 * **It is the only thing that moves money, and it is not this screen.** The
 * Edge Function creates the Stripe refund, settles the request, updates the
 * order and notifies both sides. The client's job is to ask and then to report
 * exactly what happened — which is why the whole result envelope is returned
 * rather than a boolean.
 *
 * **The `code` on the failure matters more than the message.** `missing_configuration`
 * means the refund was never attempted and the customer has been told nothing;
 * `store_rail_not_refundable_by_msn` means it never could be. Those need
 * different words on screen, so the code has to survive the trip. It does,
 * because the block below copies it onto `AppError.code`.
 *
 * TODO(agent · lib): this duplicates the private `invoke` in
 * `src/lib/queries/functions.ts` verbatim. Export that one and delete this —
 * two error-mapping tables for the same Edge Function API will drift, and the
 * one that drifts will be this copy.
 */
export async function decideRefund(input: RefundDecisionInput): Promise<RefundDecisionResult> {
  const { data, error } = await supabase.functions.invoke<RefundDecisionResult>('process-refund', {
    body: {
      refund_request_id: input.refundRequestId,
      decision: input.decision,
      amount_cents: input.amountCents ?? null,
      decision_note: input.decisionNote,
    },
  });

  if (error) {
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      const parsed = (await response.json().catch(() => null)) as EdgeErrorBody | null;
      const detail = parsed?.error ?? parsed;
      if (detail?.message) {
        throw new AppError(kindForStatus(response.status), detail.message, {
          code: detail.code,
          cause: error,
        });
      }
    }
    throw new AppError('network', 'Could not send that decision. Please try again.', {
      cause: error,
    });
  }

  if (data === null || data === undefined) {
    throw new AppError('unknown', 'Could not send that decision. Please try again.');
  }
  return data;
}
