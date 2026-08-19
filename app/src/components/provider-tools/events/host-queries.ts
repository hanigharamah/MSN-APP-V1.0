import { unwrap } from '@/lib/queries/client';
import { qk } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';
import type { TicketType, TicketTypeInsert, TicketTypeUpdate } from '@/types/database';

/**
 * The four database calls this tool needs and `src/lib/queries` does not have.
 *
 * TODO(agent · events): move every function below into
 * `src/lib/queries/events.ts` and every key into `src/lib/queries/keys.ts`.
 * They live here only because this pass does not own `src/lib/`. They are
 * written exactly as they would be there — `unwrap`, a lowercase verb-phrase
 * context, a thrown `AppError` — so the move is a cut and paste, and screens
 * still never touch `supabase.from(...)` themselves.
 *
 * What is missing upstream, and why each one is needed:
 *
 *  - `listTicketTypes` filters `is_active = true`. That is right for a buyer
 *    and wrong for a host, who has to be able to see and re-enable the tier
 *    they just switched off.
 *  - There is no `createTicketType` / `updateTicketType` at all, so tiers can
 *    only be managed on the web today.
 *  - The host list needs a sold count per event, and fetching tickets per row
 *    would be one query per card.
 */

// -----------------------------------------------------------------------------
// Keys
// -----------------------------------------------------------------------------

/**
 * Host view of an event's tiers — every row, active or not.
 *
 * Deliberately a suffix on `qk.events.ticketTypes` rather than a new top-level
 * key: prefix invalidation from `qk.events.all` still reaches it, and the
 * buyer's active-only list keeps its own cache entry. Sharing one key would
 * leak inactive tiers onto the public event screen.
 */
export function hostTicketTypesKey(eventId: string) {
  return [...qk.events.ticketTypes(eventId), 'host'] as const;
}

/**
 * Sold counts for the host's own list, keyed under that list's prefix.
 *
 * The event ids are part of the key because they are part of the query: the
 * list pages in, and a key that ignored them would serve page one's counts
 * for page two's rows.
 */
export function ticketsSoldKey(hostId: string, eventIds: readonly string[]) {
  return [...qk.events.hosting(hostId), 'sold', [...eventIds].sort().join(',')] as const;
}

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

/** Every tier on an event, inactive included. RLS scopes this to the host. */
export async function listTicketTypesForHost(eventId: string): Promise<TicketType[]> {
  return unwrap(
    supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .order('price_cents', { ascending: true })
      .order('created_at', { ascending: true }),
    'load ticket tiers',
  );
}

/**
 * Tickets sold per event, as one query for the whole list.
 *
 * Summed from `ticket_types.quantity_sold`, which the checkout Edge Function
 * maintains. That is an event-wide figure: `quantity` is a single pool per
 * tier, shared by every date of a recurring event.
 */
export async function ticketsSoldByEvent(
  eventIds: readonly string[],
): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};

  const rows = await unwrap(
    supabase
      .from('ticket_types')
      .select('event_id, quantity_sold')
      .in('event_id', [...eventIds])
      .returns<{ event_id: string; quantity_sold: number }[]>(),
    'count tickets sold',
  );

  const totals: Record<string, number> = {};
  for (const row of rows) {
    totals[row.event_id] = (totals[row.event_id] ?? 0) + row.quantity_sold;
  }
  return totals;
}

// -----------------------------------------------------------------------------
// Write
// -----------------------------------------------------------------------------

export async function createTicketType(input: TicketTypeInsert): Promise<TicketType> {
  return unwrap(
    supabase.from('ticket_types').insert(input).select('*').single(),
    'create that ticket tier',
  );
}

/**
 * Patches a tier.
 *
 * `quantity_sold` is never in the patch — `create-checkout` owns it, and a
 * client that wrote it could undo an oversold guard that has already fired.
 */
export async function updateTicketType(
  ticketTypeId: string,
  patch: TicketTypeUpdate,
): Promise<TicketType> {
  return unwrap(
    supabase.from('ticket_types').update(patch).eq('id', ticketTypeId).select('*').single(),
    'save that ticket tier',
  );
}
