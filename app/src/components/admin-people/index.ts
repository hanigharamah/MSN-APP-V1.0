/**
 * Admin — people, verification and moderation.
 *
 * The pieces the "find someone", "one account", "one report" and "find a
 * listing" screens are built from. Everything here composes `@/components/ui`;
 * nothing in this folder is a second implementation of a primitive.
 *
 * Shared with `@/components/admin` rather than reimplemented: `AdminNotice`
 * carries every single stated fact on these screens, and `FactList` renders the
 * account's details, so an operator reads an account the same way they read a
 * refund. What is left here is what the shared kit does not have —
 * `DecisionPanel` (a decision with its state, its consequences and one verb),
 * `Consequences` (an enumerated list, where `AdminNotice` takes one fact), and
 * `confirmDestructive`. See the note in `Consequences.tsx` for that boundary.
 */

export { AccountHeader } from './AccountHeader';
export type { AccountHeaderProps } from './AccountHeader';

export { ActivityPanel } from './ActivityPanel';
export type { ActivityPanelProps } from './ActivityPanel';

export { Consequences } from './Consequences';
export type { ConsequencesProps } from './Consequences';

export { DecisionPanel } from './DecisionPanel';
export type { DecisionPanelProps } from './DecisionPanel';

export { EventListingRow, ServiceListingRow } from './ListingRow';
export type { EventListingRowProps, ServiceListingRowProps } from './ListingRow';

export { PersonRow } from './PersonRow';
export type { PersonRowProps } from './PersonRow';

export { ReportSubjectCard } from './ReportSubjectCard';
export type { ReportSubjectCardProps } from './ReportSubjectCard';

export { VerificationEvidencePanel } from './VerificationEvidencePanel';
export type { VerificationEvidencePanelProps } from './VerificationEvidencePanel';

export { confirmAction, confirmDestructive } from './confirm';

export { accountTypeLabel, standingBadges, standingSummary } from './standing';
export type { Standing, StandingBadge } from './standing';

export {
  adminKeys,
  getAccountActivity,
  getMessageContext,
  getReport,
  getReportSubject,
  getVerificationEvidence,
  listPriorReports,
  resolveReport,
  searchAdminEvents,
  searchAdminServices,
  searchPeople,
  setAccountCertified,
  setAccountSuspended,
  setAccountVerified,
  ticketsSoldForEvent,
  unpublishEvent,
} from './admin-queries';
export type {
  AccountActivity,
  AdminEvent,
  AdminService,
  EvidenceReview,
  PersonRef,
  PriorReport,
  ReportSubject,
  ReportWithParties,
  ReportedEvent,
  ReportedMessage,
  VerificationEvidence,
} from './admin-queries';
