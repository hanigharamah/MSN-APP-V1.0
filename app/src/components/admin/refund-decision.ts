import { isStoreRail, type PaymentRail } from '@/types/database';
import type { RefundForDecision } from './admin-queries';
import { REFUND_DECISION_SLA_BUSINESS_DAYS, businessDaysElapsed } from './queue-model';

/**
 * What can and cannot be done to a refund request, decided before any button
 * is drawn.
 *
 * ## Why this is a module and not an `if` in the screen
 *
 * Three of the four blocks below are things the operator must not be *offered*,
 * not merely things that will fail. A disabled-looking Approve button that
 * errors on tap teaches an operator that the screen does not know what it is
 * talking about, and the next honest warning gets tapped through too. So the
 * question "can this be approved at all" is answered once, from the row, and
 * the answer decides what is rendered.
 *
 * The Edge Function checks every one of these again server-side. That is not
 * duplication — it is the actual enforcement, and this is the explanation.
 */

/** The order or booking a refund hangs off, flattened to what decides it. */
export interface RefundSubject {
  kind: 'order' | 'booking';
  /** The customer-visible code. What they will quote in an email. */
  reference: string;
  /** Event title or service title. */
  title: string | null;
  rail: PaymentRail;
  currency: string;
  /** What was actually charged. The ceiling on any refund. */
  total_cents: number;
  payment_bypassed: boolean;
  stripe_payment_intent_id: string | null;
  status: string;
}

/**
 * Flattens whichever side of the request is populated.
 *
 * `refund_targets_one_thing` guarantees exactly one is set, but a `null` here
 * is still a real outcome: the order or booking may have been deleted since,
 * and a screen that assumed otherwise would crash on the one row that most
 * needs a human to look at it.
 */
export function refundSubjectOf(refund: RefundForDecision): RefundSubject | null {
  if (refund.order) {
    const order = refund.order;
    return {
      kind: 'order',
      reference: order.reference,
      title: order.event?.title ?? null,
      rail: order.rail,
      currency: order.currency,
      total_cents: order.total_cents,
      payment_bypassed: order.payment_bypassed,
      stripe_payment_intent_id: order.stripe_payment_intent_id,
      status: order.status,
    };
  }

  if (refund.booking) {
    const booking = refund.booking;
    return {
      kind: 'booking',
      reference: booking.reference,
      title: booking.service?.title ?? null,
      rail: booking.rail,
      currency: booking.currency,
      total_cents: booking.total_cents,
      payment_bypassed: booking.payment_bypassed,
      stripe_payment_intent_id: booking.stripe_payment_intent_id,
      status: booking.status,
    };
  }

  return null;
}

/**
 * What the operator would be refunding: what they claimed, or the whole
 * payment when they did not name a figure.
 *
 * Cents throughout. This is the number sent to `process-refund` as
 * `amount_cents`, and it is sent explicitly rather than left to the server's
 * default so that what the screen says and what the server does cannot diverge.
 */
export function amountToRefund(refund: RefundForDecision, subject: RefundSubject): number {
  const claimed = refund.amount_cents;
  if (claimed === null || claimed <= 0) return subject.total_cents;
  return Math.min(claimed, subject.total_cents);
}

/**
 * Where this request stands against the promise made to the customer.
 *
 * Phrased as a commitment already given rather than a target the operator is
 * being measured on — `request-refund` sent them "within 3 business days" in
 * writing, and the operator inherits that sentence whether or not they were
 * the one who wrote it. Citing §4.2 is not decoration: it is the difference
 * between a deadline someone can look up and a number the app made up.
 */
export function refundDeadlineSentence(openedAtIso: string, now: Date = new Date()): string {
  const elapsed = businessDaysElapsed(openedAtIso, now);
  const sla = REFUND_DECISION_SLA_BUSINESS_DAYS;
  const days = (n: number) => `${n} business ${n === 1 ? 'day' : 'days'}`;

  if (elapsed > sla) {
    return `Overdue. Policy §4.2 promised a decision within ${days(sla)}; it has been ${days(elapsed)}.`;
  }
  if (elapsed === sla) {
    return `Due now. Policy §4.2 promised a decision within ${days(sla)} and that is today.`;
  }
  return `Due within ${days(sla - elapsed)}. Policy §4.2 promised a decision within ${days(sla)} of the request.`;
}

export type ApprovalBlockCode =
  | 'subject_missing'
  | 'store_rail'
  | 'no_money_taken'
  | 'no_payment_intent'
  | 'already_refunded';

export interface ApprovalBlock {
  code: ApprovalBlockCode;
  /** The headline. States the fact, not the consequence. */
  title: string;
  /** Why, and what the operator can do instead. */
  body: string;
  /** Where the rule comes from, when there is somewhere to point. */
  source?: string;
  /**
   * Whether declining still makes sense.
   *
   * Almost always true — a person asked us a question and is owed an answer
   * even when the answer is "not from us". False only where the request is
   * already settled and there is nothing left to say.
   */
  canStillDecline: boolean;
}

/**
 * The reason this request cannot be approved, or `null` if it can.
 *
 * Order matters. A store purchase that was also payment-bypassed is a store
 * purchase first — that is the fact the customer needs to be told, and it is
 * the one that never changes.
 */
export function approvalBlockFor(subject: RefundSubject | null): ApprovalBlock | null {
  if (subject === null) {
    return {
      code: 'subject_missing',
      title: 'The purchase behind this request is gone',
      body:
        'The order or booking this refund points at no longer exists, so there is nothing to refund against. Decline with an explanation, and raise it with engineering — a refund request should never outlive its purchase.',
      canStillDecline: true,
    };
  }

  if (isStoreRail(subject.rail)) {
    const store = subject.rail === 'apple_iap' ? 'Apple' : 'Google Play';
    return {
      code: 'store_rail',
      title: `Only ${store} can refund this`,
      body: `This was paid through ${store}, so ${store} took the money and MSN never received it. No approval here can return it. Decline with a note telling them to request the refund in their ${store} account — that is the only route that works.`,
      source: 'Apple guideline 3.1.3 · refund policy §5.3',
      canStillDecline: true,
    };
  }

  if (subject.payment_bypassed) {
    return {
      code: 'no_money_taken',
      title: 'No money was ever taken',
      body:
        'This purchase was completed by the test-mode payment bypass, which marks the row and charges nothing. There is no payment to return. Decline with an explanation, or close it out of band — this is test data, not revenue.',
      source: 'ALLOW_PAYMENT_BYPASS · migration 0018',
      canStillDecline: true,
    };
  }

  if (subject.stripe_payment_intent_id === null) {
    return {
      code: 'no_payment_intent',
      title: 'There is no payment on record',
      body:
        'This row carries no Stripe payment intent, so there is nothing for Stripe to refund against. If the customer was genuinely charged, find the charge in the Stripe dashboard and refund it there, then close this request. Either way it is a checkout bug and engineering needs to know.',
      canStillDecline: true,
    };
  }

  if (subject.kind === 'order' && subject.status === 'refunded') {
    return {
      code: 'already_refunded',
      title: 'This order is already fully refunded',
      body:
        'The money has already gone back. Approving again would try to refund it twice. Close the request out of band rather than deciding it here.',
      canStillDecline: false,
    };
  }

  return null;
}

/**
 * What approving actually does, in the words the operator gets in the confirm
 * dialog.
 *
 * Written to be read by someone about to press a button that moves money, so
 * it names the amount, the destination and the delay. "It usually reaches
 * their original payment method in 5–10 business days" is the same sentence
 * `process-refund` sends the customer — the operator should not be promising
 * anything different from what we tell them.
 */
export function approvalConsequence(amountLabel: string, subject: RefundSubject): string {
  const base =
    `${amountLabel} goes back to their original payment method. ` +
    'It usually reaches them in 5–10 business days, and they are notified straight away.';

  if (subject.kind === 'booking') {
    // Deliberate: `process-refund` accepts `cancel_booking` but choosing
    // between 'seeker' and 'provider' asserts whose fault it was, and nothing
    // on this screen establishes that. Better to leave the booking alone and
    // say so than to record a fault attribution nobody made.
    return `${base} The booking stays as it is — refunding does not cancel it.`;
  }

  return `${base} The order is marked refunded.`;
}

/**
 * The shortest true sentence about a decline, for the confirm step.
 *
 * §4.3 requires the written reason and requires that the customer can
 * escalate; both facts are stated because the operator is writing to a person
 * who will read it verbatim.
 */
export const DECLINE_CONSEQUENCE =
  'They are shown your reason word for word, and can reply in the app to escalate it. No money moves.';

/** Policy §4.3 wants a reason, not a word. Enough to be an actual sentence. */
export const DECLINE_NOTE_MIN_LENGTH = 20;

/** `process-refund` caps `decision_note` at 2000 characters. */
export const DECLINE_NOTE_MAX_LENGTH = 2000;

/** The validation message for a decline note, or `null` when it is fine. */
export function declineNoteError(note: string): string | null {
  const trimmed = note.trim();
  if (trimmed.length === 0) return 'A declined refund must say why, in writing.';
  if (trimmed.length < DECLINE_NOTE_MIN_LENGTH) {
    return `They read this word for word. Write at least ${DECLINE_NOTE_MIN_LENGTH} characters explaining the decision.`;
  }
  if (trimmed.length > DECLINE_NOTE_MAX_LENGTH) {
    return `Too long by ${trimmed.length - DECLINE_NOTE_MAX_LENGTH} characters.`;
  }
  return null;
}
