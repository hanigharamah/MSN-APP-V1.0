/**
 * "My events" — the host's side of the events feature.
 *
 *   import { EventFormFields, PublishPanel } from '@/components/provider-tools/events';
 *
 * Everything here is presentational or pure, with two exceptions that own
 * their own network calls because the states they can land in are their own
 * UI: `TicketTierSheet` (the tier mutation) and `host-queries.ts` (the four
 * database calls `src/lib/queries` does not have yet — see the TODO there).
 *
 * The buyer's side lives in `@/components/events` and is reused wherever the
 * two agree: `availabilityOf`, `remainingStock` and `SectionCard` all come
 * from there, so a host and a customer can never read different states off the
 * same ticket row.
 */

export { AttendeeRow } from './AttendeeRow';
export type { AttendeeRowProps } from './AttendeeRow';

export { ChoiceField } from './ChoiceField';
export type { ChoiceFieldProps, ChoiceOption } from './ChoiceField';

export { PickerField } from './PickerField';
export type { PickerFieldProps } from './PickerField';

export { DateTimeField } from './DateTimeField';
export type { DateTimeFieldProps } from './DateTimeField';

export { EventFormFields } from './EventFormFields';
export type { EventFormFieldsProps } from './EventFormFields';

export { HostEventRow } from './HostEventRow';
export type { HostEventRowProps } from './HostEventRow';

export { NoticeCard } from './NoticeCard';
export type { NoticeCardProps, NoticeTone } from './NoticeCard';

export { PublishPanel } from './PublishPanel';
export type { PublishPanelProps } from './PublishPanel';

export { TicketTierRow } from './TicketTierRow';
export type { TicketTierRowProps } from './TicketTierRow';

export { TicketTierSheet } from './TicketTierSheet';
export type { TicketTierSheetProps } from './TicketTierSheet';

export { TimeZoneField } from './TimeZoneField';
export type { TimeZoneFieldProps } from './TimeZoneField';

export { ToggleField } from './ToggleField';
export type { ToggleFieldProps } from './ToggleField';

export {
  DELIVERY_MODES,
  canPublish,
  emptyEventDraft,
  eventDraftFrom,
  eventDraftNotes,
  eventDraftToInsert,
  eventDraftToUpdate,
  hasEventDraftErrors,
  needsMeetingUrl,
  paymentRailNoticeFor,
  publishChecksFor,
  validateEventDraft,
} from './event-form';
export type {
  EventDraft,
  EventDraftErrors,
  EventFieldId,
  PublishCheck,
  PublishCheckSeverity,
} from './event-form';

export {
  DEFAULT_MAX_PER_ORDER,
  activeCurrencies,
  emptyTicketDraft,
  hasTicketDraftErrors,
  lockedCurrencyFor,
  ticketDraftFrom,
  ticketDraftNotes,
  ticketDraftToInsert,
  ticketDraftToUpdate,
  validateTicketDraft,
} from './ticket-form';
export type {
  TicketDraft,
  TicketDraftErrors,
  TicketFieldId,
  TicketValidationContext,
} from './ticket-form';

export {
  EMPTY_PARTS,
  SUGGESTED_TIME_ZONES,
  defaultEventWindow,
  dstShiftNote,
  isPartsEmpty,
  isPartsPartial,
  isValidTimeZone,
  nowParts,
  partsFromIso,
  partsToUtcIso,
  validateDate,
  validateTime,
} from './datetime';
export type { DateTimeParts } from './datetime';

export {
  centsToAmountInput,
  normaliseCurrency,
  parseAmountToCents,
  parseWholeNumber,
  validateCurrency,
} from './money';

export {
  createTicketType,
  hostTicketTypesKey,
  listTicketTypesForHost,
  ticketsSoldByEvent,
  ticketsSoldKey,
  updateTicketType,
} from './host-queries';
