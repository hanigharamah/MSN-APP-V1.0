import type { EventRow, TicketType } from '@/types/database';

/**
 * Ticket availability — the pure rules behind every label on the ticket rows
 * and the bottom bar.
 *
 * Two independent things decide whether a ticket type can be bought, and the
 * UI has to distinguish them because the answer to each is a different sentence
 * to the customer:
 *
 *   - **The sale window.** `sales_start_at` / `sales_end_at`, both nullable.
 *     Null on either end means "no bound in that direction".
 *   - **Stock.** `quantity - quantity_sold`, where `quantity === null` means
 *     unlimited. `quantity_sold` is maintained by the `create-checkout` Edge
 *     Function; nothing here ever writes it.
 *
 * Everything is integer cents and integer counts. No money is formatted in this
 * file — that happens once, at render, via `lib/format`.
 *
 * This module is deliberately free of React and of the theme so the rules can
 * be read (and later tested) on their own.
 */

export type TicketAvailability =
  /** Buyable now. `remaining === null` means unlimited stock. */
  | { kind: 'on_sale'; remaining: number | null; maxSelectable: number }
  /** Sales have not opened yet. */
  | { kind: 'not_yet_on_sale'; opensAt: string }
  /** The sale window has closed. */
  | { kind: 'sales_ended'; closedAt: string }
  /** `quantity_sold` has caught up with `quantity`. */
  | { kind: 'sold_out' }
  /**
   * In stock and inside its window, but `max_per_order` is zero, so no order
   * may contain any of it.
   *
   * `ticket_types.max_per_order` has no positive check constraint — a host (or
   * an import) can set it to 0, and the live table accepts the row. Without its
   * own state this landed in `on_sale` with `maxSelectable: 0`, which rendered
   * as a row with no badge, no stepper and no explanation, and pushed the whole
   * event to "Ticket sales have ended" — a sentence that is simply untrue.
   */
  | { kind: 'not_orderable' };

/** `null` means unlimited. Never negative, even if the counters disagree. */
export function remainingStock(ticket: TicketType): number | null {
  if (ticket.quantity === null) return null;
  return Math.max(0, ticket.quantity - ticket.quantity_sold);
}

/**
 * Availability of one ticket type.
 *
 * Order of checks is deliberate: stock is checked first because "Sold out" is
 * the more useful thing to tell someone than "sales ended" when both are true,
 * and a sold-out ticket cannot become buyable again by waiting for a window.
 */
export function availabilityOf(ticket: TicketType, now: number = Date.now()): TicketAvailability {
  const remaining = remainingStock(ticket);

  if (remaining === 0) return { kind: 'sold_out' };

  if (ticket.sales_start_at !== null && Date.parse(ticket.sales_start_at) > now) {
    return { kind: 'not_yet_on_sale', opensAt: ticket.sales_start_at };
  }

  if (ticket.sales_end_at !== null && Date.parse(ticket.sales_end_at) <= now) {
    return { kind: 'sales_ended', closedAt: ticket.sales_end_at };
  }

  // `max_per_order` is the host's cap; remaining stock is the hard ceiling.
  // Whichever is smaller is how high the stepper may go.
  const cap = Math.max(0, Math.trunc(ticket.max_per_order));
  if (cap === 0) return { kind: 'not_orderable' };

  const maxSelectable = remaining === null ? cap : Math.min(cap, remaining);

  return { kind: 'on_sale', remaining, maxSelectable };
}

export function isBuyable(availability: TicketAvailability): boolean {
  return availability.kind === 'on_sale' && availability.maxSelectable > 0;
}

// -----------------------------------------------------------------------------
// Selection
// -----------------------------------------------------------------------------

/** Ticket type id -> quantity. Only entries with a quantity above zero. */
export type TicketSelection = Readonly<Record<string, number>>;

export interface SelectionLine {
  ticket: TicketType;
  quantity: number;
}

export function quantityFor(selection: TicketSelection, ticketTypeId: string): number {
  return selection[ticketTypeId] ?? 0;
}

/**
 * Sets a quantity, clamped to what the ticket type actually allows, and drops
 * the key entirely at zero so an empty selection is an empty object.
 *
 * `now` must be the screen's clock, not `Date.now()`. A sale window that closes
 * while the page is open has to close the stepper too — reading the wall clock
 * here would let the row re-clamp against a window the rest of the screen has
 * already stopped honouring, and the server rejects the mismatch with a 409.
 *
 * `Math.trunc` is not cosmetic: `create-checkout` rejects a non-integer
 * quantity with `invalid_integer`, so a fractional value must never survive
 * into the selection.
 */
export function withQuantity(
  selection: TicketSelection,
  ticket: TicketType,
  quantity: number,
  now: number = Date.now(),
): TicketSelection {
  const availability = availabilityOf(ticket, now);
  const ceiling = availability.kind === 'on_sale' ? availability.maxSelectable : 0;
  const requested = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
  const clamped = Math.max(0, Math.min(requested, ceiling));

  const next: Record<string, number> = { ...selection };
  if (clamped === 0) {
    delete next[ticket.id];
  } else {
    next[ticket.id] = clamped;
  }
  return next;
}

/** Selected lines, in the order the ticket types were listed. */
export function selectedLines(
  tickets: readonly TicketType[],
  selection: TicketSelection,
): SelectionLine[] {
  const lines: SelectionLine[] = [];
  for (const ticket of tickets) {
    const quantity = quantityFor(selection, ticket.id);
    if (quantity > 0) lines.push({ ticket, quantity });
  }
  return lines;
}

export function selectedQuantity(lines: readonly SelectionLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * Client-side subtotal, in integer cents.
 *
 * This is an ESTIMATE and is labelled as one in the UI. `create-checkout` reads
 * every price from `ticket_types` server-side and returns the authoritative
 * `amounts` (including discount, tax and platform fee) — this number exists
 * only so the bottom bar can show something before that round trip. Prices are
 * never sent to the server.
 *
 * **Only meaningful when every line shares a currency.** `ticket_types.currency`
 * is per row and is not constrained to match `events.currency`, so adding two
 * rows blindly would produce a number that is not an amount in any currency.
 * Call `selectionCurrency()` first and only render this when it says `single`.
 */
export function subtotalCents(lines: readonly SelectionLine[]): number {
  return lines.reduce((total, line) => total + line.ticket.price_cents * line.quantity, 0);
}

// -----------------------------------------------------------------------------
// Currency
// -----------------------------------------------------------------------------

export type SelectionCurrency =
  /** Nothing selected. */
  | { kind: 'none' }
  /** Every selected line is priced in this currency. */
  | { kind: 'single'; currency: string }
  /** The selection spans currencies and cannot become one payment. */
  | { kind: 'mixed'; currencies: string[] };

/**
 * The currency a selection can actually be charged in.
 *
 * `ticket_types.currency` has a per-row default and NO constraint tying it to
 * `events.currency`, so one event can legitimately carry a £28 tier and a €15
 * tier. `create-checkout` refuses that combination with a 422 `mixed_currency`
 * ("One payment cannot span two currencies") — this is the client-side mirror,
 * so the customer reads the reason next to the steppers instead of after a
 * round trip.
 *
 * Codes are compared case-insensitively and reported upper-cased, matching the
 * server's `assertSameCurrency`.
 */
export function selectionCurrency(lines: readonly SelectionLine[]): SelectionCurrency {
  const distinct = [...new Set(lines.map((line) => line.ticket.currency.toUpperCase()))];
  if (distinct.length === 0) return { kind: 'none' };
  if (distinct.length === 1) return { kind: 'single', currency: distinct[0] as string };
  return { kind: 'mixed', currencies: distinct };
}

// -----------------------------------------------------------------------------
// Headline price
// -----------------------------------------------------------------------------

export type PriceSummary =
  | { kind: 'none' }
  | { kind: 'free' }
  | { kind: 'free_and_paid'; fromCents: number; currency: string }
  | { kind: 'from'; fromCents: number; currency: string };

/**
 * The price line the bottom bar shows before anything is selected — the web's
 * `Free` / `Free + Paid` / `From $X` triple.
 *
 * Computed from the ticket types that are actually buyable, so a sold-out
 * cheap tier does not advertise a price nobody can pay.
 *
 * The currency travels with the amount, and is the currency of the ticket type
 * the figure came from — NOT `events.currency`. Those are different columns
 * with no constraint between them, and formatting a €15 tier with the event's
 * `GBP` prints "From £15.00", which is a wrong price rather than a wrong label.
 *
 * When the cheapest paid tiers disagree on currency the lowest raw `price_cents`
 * is not a meaningful comparison, so the cheapest tier in the *most common*
 * currency wins; ties break on the currency of the cheapest row. Either way the
 * amount and the symbol printed with it come from the same row.
 */
export function priceSummary(tickets: readonly TicketType[], now: number = Date.now()): PriceSummary {
  const buyable = tickets.filter((ticket) => isBuyable(availabilityOf(ticket, now)));
  if (buyable.length === 0) return { kind: 'none' };

  const paid = buyable.filter((ticket) => ticket.price_cents > 0);
  const hasFree = buyable.some((ticket) => ticket.price_cents === 0);

  if (paid.length === 0) return { kind: 'free' };

  const cheapest = paid.reduce((lowest, ticket) =>
    ticket.price_cents < lowest.price_cents ? ticket : lowest,
  );
  const fromCents = cheapest.price_cents;
  const currency = cheapest.currency.toUpperCase();

  return hasFree
    ? { kind: 'free_and_paid', fromCents, currency }
    : { kind: 'from', fromCents, currency };
}

// -----------------------------------------------------------------------------
// Whole-event state
// -----------------------------------------------------------------------------

export type EventSaleState =
  /** At least one ticket type can be bought right now. */
  | { kind: 'open' }
  /** The host has not created any active ticket types. */
  | { kind: 'no_tickets' }
  /** Every ticket type is sold out. */
  | { kind: 'sold_out' }
  /** Nothing is on sale yet, but something will be. */
  | { kind: 'not_yet_on_sale'; opensAt: string }
  /** Every sale window has closed. */
  | { kind: 'sales_ended' }
  /** The event itself is over. */
  | { kind: 'event_passed' }
  /** The event is cancelled, unpublished or otherwise not on sale. */
  | { kind: 'unavailable'; reason: string };

/**
 * Collapses the event's status, its dates and every ticket type into the one
 * state the bottom bar renders. Mirrors the web panel's mutually exclusive
 * button states, minus the ones that only exist on desktop.
 */
export function saleStateFor(
  event: Pick<EventRow, 'status' | 'ends_at'>,
  tickets: readonly TicketType[],
  now: number = Date.now(),
): EventSaleState {
  if (event.status === 'cancelled') {
    return { kind: 'unavailable', reason: 'This event has been cancelled.' };
  }
  if (event.status !== 'published') {
    return { kind: 'unavailable', reason: 'This event is not on sale.' };
  }
  if (Date.parse(event.ends_at) <= now) {
    return { kind: 'event_passed' };
  }
  if (tickets.length === 0) {
    return { kind: 'no_tickets' };
  }

  const availabilities = tickets.map((ticket) => availabilityOf(ticket, now));

  if (availabilities.some(isBuyable)) return { kind: 'open' };

  // Nothing is buyable. Prefer the most actionable explanation: a future sale
  // opening beats "sold out", which beats "sales ended".
  const upcoming = availabilities
    .filter((a): a is Extract<TicketAvailability, { kind: 'not_yet_on_sale' }> =>
      a.kind === 'not_yet_on_sale',
    )
    .sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt));

  const soonest = upcoming[0];
  if (soonest) return { kind: 'not_yet_on_sale', opensAt: soonest.opensAt };

  if (availabilities.every((a) => a.kind === 'sold_out')) return { kind: 'sold_out' };
  // A closed window is more informative than an exhausted one when both are
  // present: it tells the customer the date they missed rather than implying
  // they were merely outbid.
  if (availabilities.some((a) => a.kind === 'sales_ended')) return { kind: 'sales_ended' };
  if (availabilities.some((a) => a.kind === 'sold_out')) return { kind: 'sold_out' };

  // Everything left is `not_orderable` — in stock, in window, capped at zero
  // per order. Not "sales have ended", which is what the old catch-all said.
  return {
    kind: 'unavailable',
    reason: 'These tickets are not being sold right now. Message the host if you would like to come.',
  };
}
