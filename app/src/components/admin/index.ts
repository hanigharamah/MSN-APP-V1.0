/**
 * =============================================================================
 * The shared admin kit
 * =============================================================================
 *
 * The pieces the admin queue and the decision screens are built from. Import
 * from here, not from the files:
 *
 *   import { QueueRow, AdminNotice, FactList } from '@/components/admin';
 *
 * ## The shape of this area, and what that means for anything added here
 *
 * The admin section is **a queue of decisions, not a database browser**. Every
 * component below assumes that, and the assumption is load-bearing:
 *
 *  - `QueueRow` shows four facts. Not a row of columns — the four things that
 *    decide what an operator opens next. There is no variant that shows more.
 *  - `WaitingPill` measures how long a *person* has been kept, not how old a
 *    *record* is, and never signals with colour alone.
 *  - `AdminNotice` is where the honesty lives: what a button will actually do,
 *    what just happened, what cannot be done here at all.
 *  - `FactList` renders a fixed set of labelled facts in a stable order, not
 *    whatever columns the select returned.
 *
 * If a new component here would render a table, a record, a count of rows, or
 * a metric nobody acts on, it belongs somewhere else — probably nowhere.
 *
 * `queue-model.ts` holds the policy (what "overdue" means, what outranks what)
 * with no data access and no JSX, so the ordering of an operator's day can be
 * read and changed in one place.
 */

export { AdminNotice } from './AdminNotice';
export type { AdminNoticeProps, AdminNoticeTone } from './AdminNotice';

export { DeclineSheet } from './DeclineSheet';
export type { DeclineSheetProps } from './DeclineSheet';

export { FactList } from './FactList';
export type { Fact, FactListProps } from './FactList';

export { QueueRow } from './QueueRow';
export type { QueueRowProps } from './QueueRow';

export { SearchEntry } from './SearchEntry';
export type { SearchEntryProps } from './SearchEntry';

export { WaitingPill } from './WaitingPill';
export type { WaitingPillProps } from './WaitingPill';

export {
  REFUND_DECISION_SLA_BUSINESS_DAYS,
  REPORT_DECISION_SLA_BUSINESS_DAYS,
  VERIFICATION_SLA_BUSINESS_DAYS,
  businessDaysElapsed,
  sortQueue,
  urgencyFor,
  urgencyLabel,
  waitingCountLabel,
  waitingFor,
  waitingSentence,
} from './queue-model';
export type { QueueItem, QueueItemKind, Urgency } from './queue-model';

export { refundQueueItem, reportQueueItem, verificationQueueItem } from './queue-items';

export {
  DECLINE_CONSEQUENCE,
  DECLINE_NOTE_MAX_LENGTH,
  DECLINE_NOTE_MIN_LENGTH,
  amountToRefund,
  approvalBlockFor,
  approvalConsequence,
  declineNoteError,
  refundDeadlineSentence,
  refundSubjectOf,
} from './refund-decision';
export type { ApprovalBlock, ApprovalBlockCode, RefundSubject } from './refund-decision';

export {
  REFUND_ERROR,
  adminQueueKeys,
  decideRefund,
  getRefundForDecision,
  listAwaitingVerification,
  listOpenReports,
  listPendingRefunds,
} from './admin-queries';
export type {
  AdminPersonRef,
  AwaitingVerification,
  OpenReport,
  PendingRefund,
  RefundBookingContext,
  RefundDecisionInput,
  RefundDecisionResult,
  RefundForDecision,
  RefundOrderContext,
  RefundSubjectSummary,
} from './admin-queries';
