import { supabase } from '@/lib/supabase';
import type {
  AvailabilityBlock,
  AvailabilityRule,
  Category,
  Profile,
  Service,
  ServiceInsert,
  ServiceUpdate,
} from '@/types/database';
import type { ServiceListFilters } from './keys';
import { rangeFor, unwrap, unwrapMaybe } from './client';

/**
 * Services — one-to-one offerings booked against a provider's availability.
 */

export type ServiceWithProvider = Service & {
  provider: Pick<
    Profile,
    'id' | 'display_name' | 'avatar_url' | 'handle' | 'is_verified' | 'timezone'
  > | null;
  category: Pick<Category, 'id' | 'name' | 'slug'> | null;
};

const SERVICE_WITH_PROVIDER_SELECT =
  '*, provider:profiles!services_provider_id_fkey(id, display_name, avatar_url, handle, is_verified, timezone), category:categories(id, name, slug)';

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

export async function listServices(
  filters: ServiceListFilters = {},
  page = 0,
): Promise<ServiceWithProvider[]> {
  const [from, to] = rangeFor(page);

  let query = supabase
    .from('services')
    .select(SERVICE_WITH_PROVIDER_SELECT)
    .eq('is_active', true);

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.providerId) query = query.eq('provider_id', filters.providerId);
  if (filters.deliveryMode) query = query.eq('delivery_mode', filters.deliveryMode);
  if (filters.maxPriceCents !== undefined) {
    query = query.lte('price_cents', filters.maxPriceCents);
  }
  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  return unwrap(
    query
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<ServiceWithProvider[]>(),
    'load services',
  );
}

export async function getService(serviceId: string): Promise<ServiceWithProvider | null> {
  return unwrapMaybe(
    supabase
      .from('services')
      .select(SERVICE_WITH_PROVIDER_SELECT)
      .eq('id', serviceId)
      .maybeSingle()
      .returns<ServiceWithProvider | null>(),
    'load that service',
  );
}

/**
 * A provider's services.
 *
 * `includeInactive` exists because the owner and a seeker want different
 * answers. A seeker should only ever see what they can book. The owner needs to
 * see paused services too — without this, switching one off made it disappear
 * from the only screen that could switch it back on, so the toggle was a
 * one-way trapdoor.
 *
 * RLS already allows it: the `active services are public` policy is
 * `using (is_active or provider_id = auth.uid() or auth_is_admin())`. Only the
 * old hardcoded filter stood in the way.
 *
 * Pass `includeInactive` ONLY when the viewer is the owner — use a distinct
 * query key for it, or a cached owner result can render paused services on the
 * public profile.
 */
export async function listServicesByProvider(
  providerId: string,
  options: { includeInactive?: boolean } = {},
): Promise<Service[]> {
  let query = supabase.from('services').select('*').eq('provider_id', providerId);
  if (!options.includeInactive) query = query.eq('is_active', true);
  // Inactive first for an owner: those are the ones needing attention.
  return unwrap(
    query.order('is_active', { ascending: true }).order('price_cents'),
    'load services',
  );
}

/** Weekly recurring windows. Public — anyone can see when a provider works. */
export async function listAvailabilityRules(providerId: string): Promise<AvailabilityRule[]> {
  return unwrap(
    supabase
      .from('availability_rules')
      .select('*')
      .eq('provider_id', providerId)
      .order('weekday')
      .order('starts_time'),
    'load availability',
  );
}

/**
 * One-off blocks. RLS restricts SELECT to the provider themselves, so a seeker
 * calling this gets an empty array rather than an error — that is why slot
 * computation cannot happen on the client (see `getAvailableSlots`).
 */
export async function listAvailabilityBlocks(
  providerId: string,
  fromIso: string,
  toIso: string,
): Promise<AvailabilityBlock[]> {
  // Overlap, not "starts within". Filtering on `starts_at` alone dropped any
  // block the provider was currently INSIDE — a two-week holiday disappeared
  // from their own calendar the moment its start date fell out of the window,
  // while still blocking every booking. A block overlaps the window when it
  // starts before the window ends AND ends after the window starts.
  return unwrap(
    supabase
      .from('availability_blocks')
      .select('*')
      .eq('provider_id', providerId)
      .lte('starts_at', toIso)
      .gte('ends_at', fromIso)
      .order('starts_at'),
    'load your calendar',
  );
}

export interface TimeSlot {
  /** UTC ISO 8601. */
  startsAt: string;
  endsAt: string;
}

/**
 * Bookable slots for a service in a date range.
 *
 * Delegates to the `available_slots` SQL function, and must keep doing so —
 * this cannot be computed on the client, for three reasons:
 *
 * 1. `availability_blocks` is invisible to seekers under RLS, so the client
 *    cannot see the gaps it has to exclude.
 * 2. Other people's `bookings` are invisible too — the client cannot tell an
 *    occupied slot from a free one.
 * 3. Two seekers computing slots independently would both be offered the same
 *    slot, and one would lose at insert time. Slot generation and the booking
 *    insert have to agree, which means the database decides.
 *
 * `from_date` / `to_date` are dates, not timestamps — the function walks whole
 * days in the provider's own zone.
 */
export async function getAvailableSlots(input: {
  serviceId: string;
  providerId: string;
  /** `YYYY-MM-DD`, inclusive. */
  fromDate: string;
  /** `YYYY-MM-DD`, inclusive. */
  toDate: string;
}): Promise<TimeSlot[]> {
  const rows = await unwrap(
    supabase.rpc('available_slots', {
      service: input.serviceId,
      provider: input.providerId,
      from_date: input.fromDate,
      to_date: input.toDate,
    }),
    'load available times',
  );

  return rows.map((row) => ({ startsAt: row.slot_start, endsAt: row.slot_end }));
}

// -----------------------------------------------------------------------------
// Write
// -----------------------------------------------------------------------------

export async function createService(input: ServiceInsert): Promise<Service> {
  return unwrap(
    supabase.from('services').insert(input).select('*').single(),
    'create that service',
  );
}

export async function updateService(serviceId: string, patch: ServiceUpdate): Promise<Service> {
  // Editing `cancellation_window_hours` does not affect existing bookings —
  // each booking snapshotted its own value at purchase time. That is
  // deliberate; see refund policy §2.3.
  return unwrap(
    supabase.from('services').update(patch).eq('id', serviceId).select('*').single(),
    'save that service',
  );
}

export async function setServiceActive(serviceId: string, isActive: boolean): Promise<Service> {
  return updateService(serviceId, { is_active: isActive });
}

export async function replaceAvailabilityRules(
  providerId: string,
  rules: readonly Omit<AvailabilityRule, 'id' | 'provider_id'>[],
): Promise<AvailabilityRule[]> {
  await unwrapMaybe(
    supabase.from('availability_rules').delete().eq('provider_id', providerId).select('id'),
    'save your availability',
  );
  if (rules.length === 0) return [];
  return unwrap(
    supabase
      .from('availability_rules')
      .insert(rules.map((rule) => ({ ...rule, provider_id: providerId })))
      .select('*'),
    'save your availability',
  );
}

export async function createAvailabilityBlock(
  input: Omit<AvailabilityBlock, 'id'>,
): Promise<AvailabilityBlock> {
  return unwrap(
    supabase.from('availability_blocks').insert(input).select('*').single(),
    'block that time',
  );
}

export async function deleteAvailabilityBlock(blockId: string): Promise<void> {
  await unwrapMaybe(
    supabase.from('availability_blocks').delete().eq('id', blockId).select('id'),
    'remove that block',
  );
}
