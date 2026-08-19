import { formatMoney } from '@/lib/format';
import { isStoreRail } from '@/types/database';
import type { AwaitingVerification, OpenReport, PendingRefund } from './admin-queries';
import {
  REFUND_DECISION_SLA_BUSINESS_DAYS,
  REPORT_DECISION_SLA_BUSINESS_DAYS,
  VERIFICATION_SLA_BUSINESS_DAYS,
  urgencyFor,
  type QueueItem,
} from './queue-model';

/**
 * Three tables become one list.
 *
 * The mapping is the design. Every row in the queue has to answer the same
 * three questions in the same three places — what is it, who is waiting, what
 * is it about — regardless of which table it came from, or the operator has to
 * re-learn the layout on every row. Doing that translation here rather than in
 * the row component is what stops the component sprouting a branch per kind.
 */

/** Account types read as sentences, not as enum members. */
const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  practitioner: 'Practitioner',
  business: 'Business',
  venue: 'Venue',
  nonprofit: 'Non-profit',
  organizer: 'Organiser',
  seeker: 'Seeker',
};

/** `harassment` -> `Harassment`; `misleading_listing` -> `Misleading listing`. */
function humaniseReason(reason: string): string {
  const spaced = reason.replace(/[_-]+/g, ' ').trim();
  if (spaced.length === 0) return 'Reported';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Collapses a customer's paragraph to one scannable line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A refund waiting for a decision.
 *
 * The `note` slot carries whichever fact would change the operator's approach
 * before they open it — a store purchase they cannot refund at all, a
 * test-mode purchase where no money moved — and falls back to the amount. That
 * ordering is deliberate: money is the usual headline, but "you cannot approve
 * this" outranks "it is £25".
 */
export function refundQueueItem(refund: PendingRefund, now: Date = new Date()): QueueItem {
  const subject = refund.order ?? refund.booking;
  const claimedCents = refund.amount_cents ?? subject?.total_cents ?? null;

  const amountLabel =
    claimedCents !== null && subject ? formatMoney(claimedCents, subject.currency) : null;

  const note = !subject
    ? 'Purchase missing'
    : isStoreRail(subject.rail)
      ? subject.rail === 'apple_iap'
        ? 'Apple — cannot refund'
        : 'Google Play — cannot refund'
      : subject.payment_bypassed
        ? 'No money taken'
        : amountLabel;

  return {
    key: `refund:${refund.id}`,
    kind: 'refund',
    href: `/(admin)/refunds/${refund.id}`,
    kindLabel: 'Refund request',
    title: subject?.title ?? 'A purchase that no longer exists',
    personName: refund.requester?.display_name ?? 'Someone who has since left',
    personAvatarUrl: refund.requester?.avatar_url ?? null,
    context: oneLine(refund.reason),
    note,
    waitingSince: refund.created_at,
    urgency: urgencyFor(refund.created_at, REFUND_DECISION_SLA_BUSINESS_DAYS, now),
  };
}

/**
 * A report waiting to be handled.
 *
 * The title names *who or what was reported*, not the reporter, because that
 * is what the operator is deciding about. The reporter still appears as the
 * person waiting — they are the one owed an answer.
 */
export function reportQueueItem(report: OpenReport, now: Date = new Date()): QueueItem {
  const subject = report.subject_profile
    ? report.subject_profile.display_name
    : report.subject_event
      ? report.subject_event.title
      : report.subject_message_id !== null
        ? 'A message'
        : 'Something that has since been deleted';

  const what = report.subject_profile
    ? 'account'
    : report.subject_event
      ? 'listing'
      : report.subject_message_id !== null
        ? 'message'
        : 'item';

  return {
    key: `report:${report.id}`,
    kind: 'report',
    href: `/(admin)/reports/${report.id}`,
    kindLabel: `Reported ${what}`,
    title: subject,
    personName: report.reporter?.display_name ?? 'Someone who has since left',
    personAvatarUrl: report.reporter?.avatar_url ?? null,
    context: report.detail ? oneLine(report.detail) : humaniseReason(report.reason),
    note: report.detail ? humaniseReason(report.reason) : null,
    waitingSince: report.created_at,
    urgency: urgencyFor(report.created_at, REPORT_DECISION_SLA_BUSINESS_DAYS, now),
  };
}

/**
 * An account that cannot sell until someone looks at it.
 *
 * Waiting is measured from `created_at` — the profile row is created by the
 * `on_auth_user_created` trigger at signup, so this is genuinely "how long
 * since they joined and could not start". There is no
 * `verification_requested_at` column to be more precise with, which slightly
 * overstates the wait for anyone who signed up and never finished their
 * profile. Noted rather than corrected: the alternative is a made-up date.
 */
export function verificationQueueItem(
  account: AwaitingVerification,
  now: Date = new Date(),
): QueueItem {
  const place = [account.city, account.country_code].filter(Boolean).join(', ');

  return {
    key: `verification:${account.id}`,
    kind: 'verification',
    href: `/(admin)/people/${account.id}`,
    kindLabel: 'Awaiting verification',
    title: account.display_name,
    personName: account.display_name,
    personAvatarUrl: account.avatar_url,
    context: place.length > 0 ? `${accountTypeOf(account.account_type)} · ${place}` : accountTypeOf(account.account_type),
    note: account.handle ? `@${account.handle}` : null,
    waitingSince: account.created_at,
    urgency: urgencyFor(account.created_at, VERIFICATION_SLA_BUSINESS_DAYS, now),
  };
}

function accountTypeOf(accountType: string): string {
  return ACCOUNT_TYPE_LABEL[accountType] ?? humaniseReason(accountType);
}
