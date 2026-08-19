import { formatDistanceStrict } from 'date-fns';

/**
 * The queue's model — what "needs you" means, and how long is too long.
 *
 * This file holds no data access and no JSX on purpose. The ordering of an
 * operator's day is a policy decision, and policy decisions should be readable
 * in one place and testable without a database.
 *
 * ## The one idea
 *
 * Every row is a person waiting for an answer. So the row's rank is a function
 * of two things and nothing else: how long they have waited, and whether we
 * promised them a date. Not the table it came from, not when it was updated,
 * not how much money is involved — a £4 refund and a £400 refund are the same
 * broken promise.
 */

// -----------------------------------------------------------------------------
// The clock
// -----------------------------------------------------------------------------

/**
 * Refund policy §4.2: acknowledge within one business day, **decide within
 * three**. `request-refund` tells the customer "within 3 business days" in the
 * confirmation it sends them, so this number is a promise already made, not a
 * target we invented here.
 */
export const REFUND_DECISION_SLA_BUSINESS_DAYS = 3;

/**
 * Reports are held to the same three days.
 *
 * Deliberately noted as a choice rather than a citation: there is no published
 * commitment on reports anywhere in the schema, the Edge Functions or the
 * policy references. Three days is borrowed from refunds because a report is
 * usually a safety question and waiting longer than a money question would be
 * indefensible. If a real SLA is ever written down, change it here.
 */
export const REPORT_DECISION_SLA_BUSINESS_DAYS = 3;

/**
 * Verification has no promised turnaround, so it gets no deadline colour.
 *
 * Inventing one would be worse than having none: a red badge that cites a
 * commitment nobody made trains the operator to ignore red. Age is still shown
 * and still sorts, so a practitioner who has waited three weeks rises to the
 * top of their group on its own.
 */
export const VERIFICATION_SLA_BUSINESS_DAYS = null;

/** Guard on the day-walk below. Two years of weekdays is far past "overdue". */
const MAX_DAYS_WALKED = 520;

function startOfLocalDay(date: Date): Date {
  const start = new Date(date.getTime());
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Whole business days that have passed since `sinceIso`.
 *
 * Counted by walking calendar days rather than dividing by 86,400,000: the
 * whole point is to skip Saturday and Sunday, and arithmetic on milliseconds
 * cannot. A Friday afternoon request is one business day old on Monday, not
 * three — showing it as overdue on Sunday would send an operator looking for
 * work that policy does not ask of them until Wednesday.
 *
 * Days are the viewer's local days. The promise was made to a customer in
 * their own zone and read by an operator in theirs; there is no third zone
 * that would be more correct, and UTC would be less.
 *
 * Public holidays are not modelled — there is no calendar in the schema to
 * model them from. The effect is that a bank-holiday Monday counts as a
 * working day, which makes the queue slightly *more* urgent than policy
 * strictly requires. That is the safe direction to be wrong in.
 */
export function businessDaysElapsed(sinceIso: string, now: Date = new Date()): number {
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return 0;

  const start = startOfLocalDay(since);
  const today = startOfLocalDay(now);
  if (today <= start) return 0;

  const cursor = new Date(start.getTime());
  let elapsed = 0;

  for (let step = 0; step < MAX_DAYS_WALKED && cursor < today; step += 1) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) elapsed += 1;
  }

  return elapsed;
}

// -----------------------------------------------------------------------------
// Urgency
// -----------------------------------------------------------------------------

/**
 * How a row reads.
 *
 * Three levels, not five. The operator is deciding whether to open this one
 * next, and a scale with more rungs than that is a scale nobody calibrates.
 */
export type Urgency =
  /** Inside the promised window, with room to spare. */
  | 'waiting'
  /** The last business day before the promise runs out. */
  | 'due-soon'
  /** The promise has been broken. */
  | 'overdue';

export function urgencyFor(
  waitingSince: string,
  slaBusinessDays: number | null,
  now: Date = new Date(),
): Urgency {
  if (slaBusinessDays === null) return 'waiting';

  const elapsed = businessDaysElapsed(waitingSince, now);
  if (elapsed >= slaBusinessDays) return 'overdue';
  if (elapsed >= slaBusinessDays - 1) return 'due-soon';
  return 'waiting';
}

/**
 * The words next to the age.
 *
 * Never colour alone: the pill says "Overdue" or "Due today" in text, so the
 * urgency survives greyscale, colour blindness and a screen reader.
 */
export function urgencyLabel(urgency: Urgency): string | null {
  switch (urgency) {
    case 'overdue':
      return 'Overdue';
    case 'due-soon':
      return 'Due today';
    case 'waiting':
      return null;
  }
}

/**
 * How long this person has been waiting: `'3 days'`, `'5 hours'`.
 *
 * Not `formatRelative` from `lib/format` — that renders "3 days ago", which
 * reads as *when something happened*. Nothing happened. Someone has been kept
 * waiting for three days and is still waiting, and the queue's whole job is to
 * say so.
 */
export function waitingFor(sinceIso: string, now: Date = new Date()): string {
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return 'unknown';
  // `formatDistanceStrict(now, since)` rather than the `…ToNow…` variant so
  // `now` is an argument. The queue re-renders on a timer and the tests need a
  // fixed clock; a function that reads the wall clock internally can do
  // neither.
  return formatDistanceStrict(now, since, { addSuffix: false, roundingMethod: 'floor' });
}

/** `'Waiting 3 days'` — the whole phrase, for a screen reader and a pill. */
export function waitingSentence(sinceIso: string, now: Date = new Date()): string {
  return `Waiting ${waitingFor(sinceIso, now)}`;
}

// -----------------------------------------------------------------------------
// The item
// -----------------------------------------------------------------------------

export type QueueItemKind = 'refund' | 'report' | 'verification';

export interface QueueItem {
  /**
   * Unique across kinds — `refund:<uuid>`. A refund and a report can never
   * share an id, but `keyExtractor` should not have to know that.
   */
  key: string;
  kind: QueueItemKind;
  /**
   * Where the decision is made.
   *
   * A plain string rather than expo-router's `Href` because three of the four
   * destinations are route files owned by a concurrent pass. See `hrefFor`.
   */
  href: string;
  /** What kind of thing this is. Two or three words. */
  kindLabel: string;
  /** What it is about — the line the operator reads first. */
  title: string;
  /** Who is waiting. */
  personName: string;
  personAvatarUrl: string | null;
  /**
   * The line that should make opening it unnecessary half the time: their
   * stated reason, the account type, what was reported.
   */
  context: string;
  /**
   * Money at stake, already formatted, or a short flag where the money is the
   * story (`'Apple purchase'`, `'No money taken'`). Null when there is none.
   */
  note: string | null;
  /** When this person started waiting. */
  waitingSince: string;
  urgency: Urgency;
}

/**
 * Refunds and reports outrank verification, always.
 *
 * The first two are someone who has already given us money or been hurt by
 * someone we let in. The third is someone who wants to start selling. That is
 * not a close call, and it is the one ordering rule worth hard-coding: an
 * unverified practitioner who has waited a month must not push a customer's
 * broken refund promise off the top of the screen.
 */
const KIND_RANK: Record<QueueItemKind, number> = {
  refund: 0,
  report: 0,
  verification: 1,
};

const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 0,
  'due-soon': 1,
  waiting: 2,
};

/**
 * Most urgent first: group, then promise, then age.
 *
 * Age is the final tiebreak in every group, so the queue always drains
 * oldest-first within a band and nobody is silently skipped.
 */
export function sortQueue(items: readonly QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;

    const byUrgency = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (byUrgency !== 0) return byUrgency;

    return Date.parse(a.waitingSince) - Date.parse(b.waitingSince);
  });
}

/** `'4 people waiting'`. Plural handled, zero handled by the empty state. */
export function waitingCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'} waiting`;
}
