import { supabase } from '@/lib/supabase';
import type {
  AccountType,
  Profile,
  ProfileUpdate,
  ProviderDetails,
  ProviderDetailsUpdate,
  Review,
  Speciality,
} from '@/types/database';
import { PAGE_SIZE, escapeForOrIlike, rangeFor, unwrap, unwrapMaybe } from './client';

/**
 * Profiles, provider details, specialities, reviews and follows.
 *
 * RLS reminders that shape what is possible here:
 * - Profiles are publicly readable unless suspended.
 * - `is_verified` / `is_certified` / `is_admin` / `is_suspended` /
 *   `account_type` are reverted by a trigger for non-admins. Sending them
 *   succeeds and does nothing — never build UI that implies otherwise.
 */

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

export async function getProfile(profileId: string): Promise<Profile | null> {
  return unwrapMaybe(
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    'load that profile',
  );
}

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  return unwrapMaybe(
    supabase.from('profiles').select('*').eq('handle', handle).maybeSingle(),
    'load that profile',
  );
}

export async function getProviderDetails(profileId: string): Promise<ProviderDetails | null> {
  return unwrapMaybe(
    supabase.from('provider_details').select('*').eq('profile_id', profileId).maybeSingle(),
    'load provider details',
  );
}

export async function listSpecialities(): Promise<Speciality[]> {
  return unwrap(
    supabase.from('specialities').select('*').eq('is_active', true).order('name'),
    'load specialities',
  );
}

export async function getProfileSpecialities(profileId: string): Promise<Speciality[]> {
  const rows = await unwrap(
    supabase
      .from('profile_specialities')
      .select('speciality:specialities(*)')
      .eq('profile_id', profileId)
      .returns<{ speciality: Speciality | null }[]>(),
    'load specialities',
  );
  return rows.flatMap((row) => (row.speciality ? [row.speciality] : []));
}

export interface ProviderRating {
  /** `null` when there are no visible reviews. */
  average: number | null;
  total: number;
}

/**
 * Calls the `provider_rating(uuid)` SQL function. It returns a one-row table,
 * so PostgREST replies with an array — hence the `[0]`.
 */
export async function getProviderRating(profileId: string): Promise<ProviderRating> {
  const rows = await unwrap(
    supabase.rpc('provider_rating', { p_profile: profileId }),
    'load ratings',
  );
  return rows[0] ?? { average: null, total: 0 };
}

export type ReviewWithAuthor = Review & {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'handle'> | null;
};

export async function listReviewsForProfile(
  profileId: string,
  page = 0,
): Promise<ReviewWithAuthor[]> {
  const [from, to] = rangeFor(page);
  return unwrap(
    supabase
      .from('reviews')
      .select('*, author:profiles!reviews_author_id_fkey(id, display_name, avatar_url, handle)')
      .eq('subject_id', profileId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<ReviewWithAuthor[]>(),
    'load reviews',
  );
}

// -----------------------------------------------------------------------------
// Write
// -----------------------------------------------------------------------------

/**
 * Updates the signed-in user's profile.
 *
 * `ProfileUpdate` includes the trust flags because they exist on the table,
 * but `guard_profile_trust_flags` reverts them for non-admins. Do not pass
 * them; the write will appear to succeed and change nothing.
 */
export async function updateProfile(profileId: string, patch: ProfileUpdate): Promise<Profile> {
  return unwrap(
    supabase.from('profiles').update(patch).eq('id', profileId).select('*').single(),
    'save your profile',
  );
}

export async function upsertProviderDetails(
  profileId: string,
  patch: ProviderDetailsUpdate,
): Promise<ProviderDetails> {
  return unwrap(
    supabase
      .from('provider_details')
      .upsert({ ...patch, profile_id: profileId }, { onConflict: 'profile_id' })
      .select('*')
      .single(),
    'save your provider details',
  );
}

export async function setProfileSpecialities(
  profileId: string,
  specialityIds: readonly string[],
): Promise<void> {
  // Delete-then-insert rather than a diff: the join table is tiny and this is
  // the only shape that cannot leave orphans.
  await unwrapMaybe(
    supabase.from('profile_specialities').delete().eq('profile_id', profileId).select('profile_id'),
    'update your specialities',
  );
  if (specialityIds.length === 0) return;
  await unwrapMaybe(
    supabase
      .from('profile_specialities')
      .insert(specialityIds.map((id) => ({ profile_id: profileId, speciality_id: id })))
      .select('profile_id'),
    'update your specialities',
  );
}

// -----------------------------------------------------------------------------
// Follows
// -----------------------------------------------------------------------------

export async function followProfile(followerId: string, followedId: string): Promise<void> {
  await unwrapMaybe(
    supabase
      .from('follows')
      .upsert({ follower_id: followerId, followed_id: followedId }, { onConflict: 'follower_id,followed_id' })
      .select('follower_id'),
    'follow that profile',
  );
}

export async function unfollowProfile(followerId: string, followedId: string): Promise<void> {
  await unwrapMaybe(
    supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('followed_id', followedId)
      .select('follower_id'),
    'unfollow that profile',
  );
}

export async function isFollowing(followerId: string, followedId: string): Promise<boolean> {
  const row = await unwrapMaybe(
    supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', followerId)
      .eq('followed_id', followedId)
      .maybeSingle(),
    'check whether you follow that profile',
  );
  return row !== null;
}

export async function listFollowing(followerId: string, page = 0): Promise<Profile[]> {
  const [from, to] = rangeFor(page);
  const rows = await unwrap(
    supabase
      .from('follows')
      .select('followed:profiles!follows_followed_id_fkey(*)')
      .eq('follower_id', followerId)
      .range(from, to)
      .returns<{ followed: Profile | null }[]>(),
    'load who you follow',
  );
  return rows.flatMap((row) => (row.followed ? [row.followed] : []));
}

// -----------------------------------------------------------------------------
// Discovery
// -----------------------------------------------------------------------------

export interface ProviderSearchFilters {
  search?: string;
  specialityId?: string;
  city?: string;
  onlyVerified?: boolean;
}

/**
 * TODO(agent · discover): proximity ranking.
 *
 * The schema has a GiST index on `ll_to_earth(latitude, longitude)` for both
 * `profiles` and `events`, but PostgREST cannot express an `earth_box` filter.
 * Add a `search_providers_near(lat, lng, radius_km, ...)` SQL function in a
 * new migration and call it with `supabase.rpc` here. Until then this is a
 * plain filtered list ordered by verification then name.
 */
export async function searchProviders(
  filters: ProviderSearchFilters,
  page = 0,
): Promise<Profile[]> {
  const [from, to] = rangeFor(page);
  let query = supabase
    .from('profiles')
    .select('*')
    .neq('account_type', 'seeker')
    .eq('is_suspended', false);

  if (filters.search) {
    const term = escapeForOrIlike(filters.search);
    if (term.length > 0) {
      query = query.or(`display_name.ilike.%${term}%,headline.ilike.%${term}%`);
    }
  }
  if (filters.city) query = query.eq('city', filters.city);
  if (filters.onlyVerified) query = query.eq('is_verified', true);

  if (filters.specialityId) {
    // PostgREST cannot filter the parent by a child column without an inner
    // join that changes the row shape, so resolve the ids first. The join
    // table is small and this keeps the return type honest.
    const matches = await unwrap(
      supabase
        .from('profile_specialities')
        .select('profile_id')
        .eq('speciality_id', filters.specialityId),
      'search practitioners',
    );
    if (matches.length === 0) return [];
    query = query.in(
      'id',
      matches.map((row) => row.profile_id),
    );
  }

  return unwrap(
    query
      .order('is_verified', { ascending: false })
      .order('display_name')
      .range(from, to),
    'search practitioners',
  );
}

/**
 * Become a practitioner.
 *
 * The one self-service change to `account_type`. `guard_profile_trust_flags`
 * reverts any direct write to it, so this goes through `become_practitioner`
 * (migration 0028), which performs exactly the seeker → practitioner transition
 * and refuses everything else — no organisation types, no reverse, and none of
 * the trust badges.
 *
 * Idempotent: calling it when you are already a provider returns your current
 * type rather than failing, so a double tap is harmless.
 */
export async function becomePractitioner(): Promise<AccountType> {
  return unwrap(supabase.rpc('become_practitioner'), 'set up your practice');
}

export { PAGE_SIZE };
