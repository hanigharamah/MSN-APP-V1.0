/**
 * Event detail and ticket checkout.
 *
 * Everything here is presentational or pure. The only piece that talks to the
 * network is `CheckoutSheet`, which owns the `create-checkout` mutation because
 * the states it can land in (free order fulfilled, payment not wired, Apple IAP
 * refusal) are the sheet's own UI and nothing else needs them.
 *
 *   import { EventHero, CheckoutBar } from '@/components/events';
 */
export { AsyncSection, InlineError } from './AsyncSection';
export type { AsyncSectionProps, InlineErrorProps } from './AsyncSection';

export { BottomSheet } from './BottomSheet';
export type { BottomSheetProps } from './BottomSheet';

export { CheckoutBar } from './CheckoutBar';
export type { CheckoutBarProps, CheckoutBlock } from './CheckoutBar';

export { CheckoutSheet } from './CheckoutSheet';
export type { CheckoutSheetProps } from './CheckoutSheet';

export { EventActions } from './EventActions';
export type { EventActionsProps } from './EventActions';

export { EventAgenda } from './EventAgenda';
export type { EventAgendaProps } from './EventAgenda';

export { EventGallery, EventGallerySkeleton } from './EventGallery';
export type { EventGalleryProps } from './EventGallery';

export { EventHero } from './EventHero';
export type { EventHeroProps } from './EventHero';

export { EventHostRow } from './EventHostRow';
export type { EventHostRowProps } from './EventHostRow';

export { EventWhen } from './EventWhen';
export type { EventWhenProps } from './EventWhen';

export { EventWhere } from './EventWhere';
export type { EventWhereProps } from './EventWhere';

export { SectionCard } from './SectionCard';
export type { SectionCardProps } from './SectionCard';

export { QuantityStepper } from './QuantityStepper';
export type { QuantityStepperProps } from './QuantityStepper';

export { TicketList, TicketListSkeleton } from './TicketList';
export type { TicketListProps } from './TicketList';

export { TicketTypeRow } from './TicketTypeRow';
export type { TicketTypeRowProps } from './TicketTypeRow';

export {
  availabilityOf,
  isBuyable,
  priceSummary,
  quantityFor,
  remainingStock,
  saleStateFor,
  selectedLines,
  selectedQuantity,
  selectionCurrency,
  subtotalCents,
  withQuantity,
} from './ticket-availability';
export type {
  EventSaleState,
  PriceSummary,
  SelectionCurrency,
  SelectionLine,
  TicketAvailability,
  TicketSelection,
} from './ticket-availability';

export { useNow } from './use-now';

export { isWebUrl, mapsUrlFor, openExternal, webMapsUrlFor } from './external-links';
export type { VenueLocation } from './external-links';
