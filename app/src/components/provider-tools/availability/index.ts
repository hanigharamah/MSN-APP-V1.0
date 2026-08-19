/**
 * The Availability provider tool.
 *
 *   import { WeeklyHoursSection, useWeeklyHours } from '@/components/provider-tools/availability';
 *
 * Three writable surfaces and one read-only one, all of them about the same
 * question — when can somebody book you:
 *
 *   `BookingStatusSection`  provider_details.accepts_bookings / is_out_of_office
 *   `WeeklyHoursSection`    availability_rules, replaced wholesale on save
 *   `TimeOffSection`        availability_blocks, added and removed one at a time
 *   `SlotPreviewSection`    the `available_slots` RPC — the actual answer
 *
 * The rule everything here is arranged around: **a weekly window is a
 * wall-clock time in a named zone, and a slot is a UTC instant.** Every screen
 * that has ever got this wrong got it wrong by letting the two look the same.
 *
 * ## Where these are mounted
 *
 * There is no longer an Availability screen. It was a top-level sibling of
 * services and events, which meant it was a menu item that did nothing for a
 * host who runs events only, and it had to keep explaining that the numbers
 * shaping it — duration and buffer — lived on the service rather than on
 * itself. See `docs/spec-listings.md` §4.4. The pieces split by what they
 * actually describe:
 *
 *   the SERVICE   `(provider)/services/[id]` — hours, time off, slot preview
 *   the PERSON    `(tabs)/profile` — `BookingStatusSection`, because taking
 *                 bookings at all is not a property of one listing
 *
 * `availability_rules` is still keyed on `provider_id`, so the hours shown
 * inside a service are shared across every service. The heading there says so
 * outright — without that sentence the section implies a per-service edit,
 * which is the one wrong idea this arrangement could plant.
 */
export { BookingStatusSection } from './BookingStatusSection';
export type { BookingStatusSectionProps } from './BookingStatusSection';

export { BlockEditorSheet } from './BlockEditorSheet';
export type { BlockEditorSheetProps, NewBlock } from './BlockEditorSheet';

export { FieldButton } from './FieldButton';
export type { FieldButtonProps } from './FieldButton';

export { OptionListSheet } from './OptionListSheet';
export type { OptionListSheetProps, SheetOption } from './OptionListSheet';

export { RuleEditorSheet } from './RuleEditorSheet';
export type { RuleEditorSheetProps } from './RuleEditorSheet';

export { RuleZoneNote } from './RuleZoneNote';
export type { RuleZoneNoteProps } from './RuleZoneNote';

export { SlotPreviewSection } from './SlotPreviewSection';
export type { SlotPreviewSectionProps } from './SlotPreviewSection';

export { TimeOffSection } from './TimeOffSection';
export type { TimeOffSectionProps } from './TimeOffSection';

export { ToggleRow } from './ToggleRow';
export type { ToggleRowProps } from './ToggleRow';

export { WeeklyHoursSection } from './WeeklyHoursSection';
export type { WeeklyHoursSectionProps } from './WeeklyHoursSection';

export { rulesQueryKey, useWeeklyHours } from './use-weekly-hours';
export type { WeeklyHours } from './use-weekly-hours';

export {
  dateOptions,
  draftFromRules,
  END_OF_DAY_MINUTES,
  formatClock,
  formatWindow,
  formatWindowLength,
  instantFromWallClock,
  minutesToTime,
  newRuleKey,
  nextOccurrence,
  normaliseTime,
  overlapWarnings,
  problemsFor,
  problemWith,
  rulesForWeekday,
  rulesPayload,
  signatureOf,
  sortDraft,
  timeOptions,
  timeToMinutes,
  todayKey,
  WEEKDAYS,
  weekdayLong,
} from './availability-model';
export type { DateOption, DraftRule, RuleOccurrence, RulePayload, WeekdayOption } from './availability-model';

export { isValidTimeZone, listTimeZones, offsetLabel, timeZoneLabel } from './time-zones';
