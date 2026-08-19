/**
 * Practitioner profile and one-to-one booking pieces.
 *
 * Import from here, not from the individual files:
 *
 *   import { ProfileHeader, SlotPicker } from '@/components/providers';
 *
 * Everything in this folder composes the shared kit in `@/components/ui` — none
 * of it re-implements a Button, a Card or a Text. The only genuinely new
 * primitives are the ones the kit has no answer for: a star row, a date strip
 * and a slot grid.
 */
export { AboutPanel } from './AboutPanel';
export type { AboutPanelProps } from './AboutPanel';

export { BookingActionBar } from './BookingActionBar';
export type { BookingActionBarProps } from './BookingActionBar';

export { BookingResultPanel } from './BookingResultPanel';
export type { BookingResultPanelProps } from './BookingResultPanel';

export { DateStrip } from './DateStrip';
export type { DateStripProps } from './DateStrip';

export { HostedEventListItem } from './HostedEventListItem';
export type { HostedEventListItemProps } from './HostedEventListItem';

export { ProfileHeader } from './ProfileHeader';
export type { ProfileHeaderProps } from './ProfileHeader';

export { PROVIDER_TABS, ProfileTabs } from './ProfileTabs';
export type { ProfileTabsProps, ProviderTabKey } from './ProfileTabs';

export { RatingStars } from './RatingStars';
export type { RatingStarsProps } from './RatingStars';

export { ReviewListItem } from './ReviewListItem';
export type { ReviewListItemProps } from './ReviewListItem';

export { ServiceListItem } from './ServiceListItem';
export type { ServiceListItemProps } from './ServiceListItem';

export { SlotPicker } from './SlotPicker';
export type { SlotPickerProps } from './SlotPicker';

export {
  DATE_STRIP_DAYS,
  RPC_RANGE_PAD_DAYS,
  buildDayOptions,
  dayKeyOf,
  groupSlotsByDay,
  isCrossTimeZone,
  rpcDateRange,
} from './booking-time';
export type { DayOption } from './booking-time';

export { deliveryModeIcon, deliveryModeLabel, locationLabel } from './labels';
