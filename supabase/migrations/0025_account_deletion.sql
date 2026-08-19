-- Account deletion, and a tight door check-in.
--
-- ## Deletion is anonymisation, not a DELETE
--
-- `orders`, `bookings` and `refund_requests` all reference `profiles` with
-- `on delete restrict` (0004). That was the right call and it settles the
-- design: a row that records money changing hands cannot be removed because
-- one party later asks to leave. Tax and accounting law says the same, and
-- GDPR's right to erasure carves out exactly this — retention required by
-- another legal obligation.
--
-- So the profile is emptied of everything that identifies a person, and the
-- rows that reference it keep pointing at a tombstone. "Deleted account" is a
-- real state, not a missing row.
--
-- ## The grace period
--
-- Requesting deletion does not anonymise anything. It stamps
-- `deletion_requested_at`, and from that moment the account is dark: hidden
-- from search, nothing new bookable. Signing in again inside 30 days undoes
-- it completely. Most deletions are a bad afternoon, not a decision, and an
-- irreversible button turns every one of those into a support case nobody can
-- fix.
--
-- Anonymisation happens after the window, by calling `finalise_account_deletion`.
-- NOTHING SCHEDULES THAT YET — see the note on the function.
--
-- ## Refusing while money is outstanding
--
-- You cannot leave while someone is holding a session with you next Tuesday
-- that they have paid for. `account_deletion_blockers` lists what is in the
-- way so the app can name it, rather than refusing with a shrug.

alter table profiles
  add column deletion_requested_at timestamptz,
  add column deleted_at            timestamptz;

comment on column profiles.deletion_requested_at is
  'Set when the person asks to leave. The account is dark from this moment but fully recoverable until finalised. Null once cancelled.';
comment on column profiles.deleted_at is
  'Set when the profile has actually been anonymised. Terminal — there is nothing left to restore.';

-- Pending and finalised deletions are both excluded from discovery, so the
-- partial index covers the only rows anything queries by.
create index profiles_pending_deletion_idx
  on profiles (deletion_requested_at)
  where deletion_requested_at is not null and deleted_at is null;

-- -----------------------------------------------------------------------------
-- What is in the way
-- -----------------------------------------------------------------------------

/*
 * Everything stopping this account from being deleted, one row each.
 *
 * Returned as a set rather than a boolean so the app can say "you have 2
 * sessions booked with you and 1 event with tickets sold" instead of "you
 * cannot do this". A refusal a person cannot act on is a dead end.
 */
create or replace function account_deletion_blockers(p_profile uuid default auth.uid())
returns table (kind text, detail text, occurs_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  -- Sessions other people have booked with them.
  select
    'provider_booking'::text,
    'A session someone has booked with you',
    b.starts_at
  from bookings b
  where b.provider_id = p_profile
    and b.status in ('requested', 'confirmed')
    and b.starts_at > now()

  union all

  -- Sessions they have booked with someone else. Blocked too: the practitioner
  -- has held that time, and vanishing without cancelling wastes it.
  select
    'seeker_booking'::text,
    'A session you have booked',
    b.starts_at
  from bookings b
  where b.seeker_id = p_profile
    and b.status in ('requested', 'confirmed')
    and b.starts_at > now()

  union all

  -- Events they are hosting that people hold tickets for. The strongest of the
  -- three: strangers have paid to turn up somewhere.
  select
    'event_with_tickets'::text,
    'Your event "' || e.title || '" has tickets sold',
    e.starts_at
  from events e
  where e.host_id = p_profile
    and e.starts_at > now()
    and exists (
      select 1 from tickets t
      where t.event_id = e.id and not t.is_void
    )

  order by 3;
$$;

comment on function account_deletion_blockers is
  'Commitments preventing deletion, one row each, so the app can name them. Empty means the account can be closed.';

-- -----------------------------------------------------------------------------
-- Request, and change your mind
-- -----------------------------------------------------------------------------

create or replace function request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  blocker_count integer;
  requested timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  select count(*) into blocker_count from account_deletion_blockers(auth.uid());

  if blocker_count > 0 then
    -- The app lists the specifics from `account_deletion_blockers`; this is the
    -- backstop for anything calling the function directly.
    raise exception
      'Cannot close this account: % commitment(s) are outstanding.', blocker_count
      using errcode = 'P0001';
  end if;

  update profiles
     set deletion_requested_at = coalesce(deletion_requested_at, now())
   where id = auth.uid()
     and deleted_at is null
  returning deletion_requested_at into requested;

  if requested is null then
    raise exception 'No account to close.' using errcode = 'P0002';
  end if;

  return requested;
end;
$$;

create or replace function cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  -- `deleted_at is null` is the whole guard: once anonymised there is no name,
  -- no handle and no photograph left to restore, so "undo" would be a lie.
  update profiles
     set deletion_requested_at = null
   where id = auth.uid()
     and deleted_at is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Finalise
-- -----------------------------------------------------------------------------

/*
 * Anonymise a profile whose grace period has run out.
 *
 * NOT scheduled. Nothing calls this yet — it needs a daily job (pg_cron, or a
 * scheduled Edge Function) that finds profiles past the window and calls it.
 * Until that exists, deletion requests sit dark for ever and are recoverable
 * for ever, which is a safe way to be incomplete but IS incomplete: the
 * promise to erase has not been kept until this runs.
 *
 * Deliberately does NOT touch `auth.users`. Deleting the auth row cascades to
 * `profiles`, which the `restrict` references on orders and bookings would
 * refuse anyway — so the sign-in credential is cleared instead, leaving the
 * tombstone that every financial record still points at.
 */
create or replace function finalise_account_deletion(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grace_days constant integer := 30;
begin
  update profiles
     set display_name = 'Deleted account',
         handle       = null,
         first_name   = null,
         last_name    = null,
         headline     = null,
         bio          = null,
         avatar_url   = null,
         cover_url    = null,
         email        = null,
         phone        = null,
         website      = null,
         country_code = null,
         region       = null,
         city         = null,
         postal_code  = null,
         latitude     = null,
         longitude    = null,
         is_verified  = false,
         is_certified = false,
         is_suspended = true,
         deleted_at   = now()
   where id = p_profile
     and deleted_at is null
     and deletion_requested_at is not null
     and deletion_requested_at < now() - make_interval(days => grace_days);

  if found then
    -- Cut off sign-in. The row stays so every order and booking keeps a valid
    -- foreign key; it simply belongs to nobody now.
    update auth.users
       set email              = 'deleted-' || p_profile::text || '@deleted.invalid',
           encrypted_password = null,
           phone              = null,
           raw_user_meta_data = '{}'::jsonb
     where id = p_profile;
  end if;
end;
$$;

revoke execute on function finalise_account_deletion(uuid) from anon, authenticated;

comment on function finalise_account_deletion is
  'Anonymises a profile past its 30-day grace period. NOT SCHEDULED — needs a daily job before the erasure promise is actually kept.';

-- -----------------------------------------------------------------------------
-- Keep the departing out of discovery
-- -----------------------------------------------------------------------------

-- Taken verbatim from 0014 with ONE clause added, rather than rewritten from
-- memory: the return signature has to match exactly or `create or replace`
-- fails with 42P13, and a hand-typed copy of an 18-column table is a bug
-- waiting to happen.
create or replace function search_providers(
  q          text default null,
  speciality uuid default null,
  near_lat   double precision default null,
  near_lng   double precision default null,
  radius_km  integer default null,
  limit_n    integer default 20,
  offset_n   integer default 0
)
returns table (
  id uuid, handle citext, display_name text, headline text, avatar_url text,
  cover_url text, account_type account_type, city text, region text,
  country_code character, latitude double precision, longitude double precision,
  is_verified boolean, is_certified boolean,
  rating_average numeric, rating_count bigint,
  distance_km double precision, relevance real
)
language sql
stable
as $$
  with params as (
    select
      nullif(btrim(coalesce(search_providers.q, '')), '') as term,
      case
        when search_providers.near_lat is not null and search_providers.near_lng is not null
        then ll_to_earth(search_providers.near_lat, search_providers.near_lng)
      end as origin,
      coalesce(search_providers.radius_km, 50) * 1000.0 as radius_m
  ),
  matched as (
    select
      pr.id, pr.handle, pr.display_name, pr.headline, pr.avatar_url, pr.cover_url,
      pr.account_type, pr.city, pr.region, pr.country_code,
      case when pr.hide_exact_location then null else pr.latitude  end as latitude,
      case when pr.hide_exact_location then null else pr.longitude end as longitude,
      pr.is_verified, pr.is_certified,
      r.average as rating_average,
      r.total   as rating_count,
      case
        when p.origin is not null and pr.latitude is not null and pr.longitude is not null
        then round((earth_distance(p.origin, ll_to_earth(pr.latitude, pr.longitude)) / 1000.0)::numeric, 1)::double precision
      end as distance_km,
      case
        when p.term is null then 0::real
        else ts_rank(profiles_search_doc(pr.display_name, pr.headline, pr.bio),
                     websearch_to_tsquery('english', p.term))
      end as relevance
    from profiles pr
    cross join params p
    left join lateral provider_rating(pr.id) r on true
    where pr.account_type <> 'seeker'
      and not pr.is_suspended
      -- Someone on their way out stops appearing the moment they ask, not 30
      -- days later. Cancelling the request puts them straight back.
      and pr.deletion_requested_at is null
      and (search_providers.speciality is null
           or exists (select 1 from profile_specialities ps
                      where ps.profile_id = pr.id
                        and ps.speciality_id = search_providers.speciality))
      and (p.term is null
           or profiles_search_doc(pr.display_name, pr.headline, pr.bio)
              @@ websearch_to_tsquery('english', p.term))
      and (p.origin is null
           or (pr.latitude is not null and pr.longitude is not null
               and earth_box(p.origin, p.radius_m) @> ll_to_earth(pr.latitude, pr.longitude)
               and earth_distance(p.origin, ll_to_earth(pr.latitude, pr.longitude)) <= p.radius_m))
  )
  select * from matched
  order by relevance desc, is_verified desc, distance_km nulls last, display_name, id
  limit  coalesce(search_providers.limit_n, 20)
  offset coalesce(search_providers.offset_n, 0);
$$;

-- -----------------------------------------------------------------------------
-- Door check-in
-- -----------------------------------------------------------------------------

/*
 * Mark one ticket used, by its printed code.
 *
 * A function rather than a plain UPDATE, for two reasons. The host's update
 * policy on `tickets` (0006) permits writing ANY column — fine for a trusted
 * dashboard, too broad for something a phone camera drives. And the door needs
 * answers, not silence: already used, wrong event, void, unknown code are four
 * different things to say to somebody standing in front of you, and an UPDATE
 * that matches no rows cannot tell them apart.
 *
 * `status` is the whole return value: 'ok', 'already_used', 'wrong_event',
 * 'void', 'not_found'. Only 'ok' writes anything.
 */
create or replace function check_in_ticket(p_code text, p_event uuid)
returns table (
  status         text,
  ticket_id      uuid,
  attendee_name  text,
  checked_in_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  t tickets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  -- The host of the event being scanned, or an admin. Checked against the
  -- EVENT rather than the ticket, so a code from someone else's event cannot
  -- be used to probe whether it exists.
  if not exists (
    select 1 from events e where e.id = p_event and e.host_id = auth.uid()
  ) and not auth_is_admin() then
    raise exception 'This is not your event.' using errcode = '42501';
  end if;

  select * into t from tickets
   where tickets.code = btrim(p_code)
   limit 1;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if t.event_id <> p_event then
    return query select 'wrong_event'::text, t.id, t.attendee_name, t.checked_in_at;
    return;
  end if;

  if t.is_void then
    return query select 'void'::text, t.id, t.attendee_name, t.checked_in_at;
    return;
  end if;

  if t.checked_in_at is not null then
    -- Deliberately NOT an error: the same ticket scanned twice is the most
    -- common thing that happens on a door, and the useful answer is when it
    -- was first used, not a failure.
    return query select 'already_used'::text, t.id, t.attendee_name, t.checked_in_at;
    return;
  end if;

  update tickets
     set checked_in_at = now(),
         checked_in_by = auth.uid()
   where id = t.id;

  return query select 'ok'::text, t.id, t.attendee_name, now();
end;
$$;

comment on function check_in_ticket is
  'Marks a ticket used from its code. Returns ok / already_used / wrong_event / void / not_found. Host of the event, or admin, only.';
