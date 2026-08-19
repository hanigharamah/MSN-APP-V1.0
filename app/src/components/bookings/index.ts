/**
 * Bookings feature components.
 *
 *   import { BookingCard, Segmented } from '@/components/bookings';
 *
 * Everything here is specific to the Bookings tab and the booking detail
 * screen. Anything that turns out to be generally useful — the segmented
 * control is the likely candidate — should graduate to `@/components/ui`
 * rather than being imported from here by an unrelated screen.
 */
export { ActionSheet } from './ActionSheet';
export type { ActionSheetOption, ActionSheetProps } from './ActionSheet';

export { BookingActions } from './BookingActions';
export type { BookingActionsProps } from './BookingActions';

export { BookingCard } from './BookingCard';
export type { BookingCardProps } from './BookingCard';

export { BookingPartyRow } from './BookingPartyRow';
export type { BookingPartyRowProps } from './BookingPartyRow';

export { CancellationNotice } from './CancellationNotice';
export type { CancellationNoticeProps } from './CancellationNotice';

export { MeetingLinkCard } from './MeetingLinkCard';
export type { MeetingLinkCardProps } from './MeetingLinkCard';

export { Segmented } from './Segmented';
export type { SegmentedOption, SegmentedProps } from './Segmented';

export { TicketCard } from './TicketCard';
export type { TicketCardProps } from './TicketCard';

export {
  cancellationAlertMessage,
  cancellationTermsFor,
  hasEnded,
  hasStarted,
  isTerminalBooking,
} from './cancellation';
export type { CancellableBooking, CancellationTerms } from './cancellation';

export { useBookingActions, useOpenBookingConversation } from './use-booking-actions';
export type { BookingActions as BookingActionSet } from './use-booking-actions';
