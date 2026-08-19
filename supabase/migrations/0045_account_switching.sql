-- Switching between accounts, not between modes.
--
-- ## The distinction
--
-- `ModeContext` already lets one person flip between seeking and hosting. That
-- is one identity wearing two hats. This is different: one PERSON holding
-- several accounts — their own seeker profile, and the business, venue or
-- nonprofit they run — and choosing which one they are acting as.
--
-- ## Why a join table and not a column
--
-- A business is not a field on a person. It is an account in its own right,
-- with its own name, avatar, listings, reviews and money, and it outlives
-- whoever administers it. Modelling it as `profiles.business_name` would mean a
-- business could never have two admins, could never be handed over, and could
-- never host anything under its own name.
--
-- So: accounts are profiles, people are profiles, and `account_members` says
-- who may act as whom.
--
-- ## Precedent
--
-- The old Laravel app already went here — `users.primary_identity` plus an
-- `additionalIdentities` array, so one login could hold several identities.
-- This is the same idea with the ownership made explicit instead of implied by
-- a list of strings on a row.

create table account_members (
  -- The account being acted as. Always a profile.
  account_id uuid not null references profiles(id) on delete cascade,
  -- The person doing the acting.
  member_id  uuid not null references profiles(id) on delete cascade,

  -- `owner` may hand the account to someone else; `manager` may run it but not
  -- give it away. Deliberately only two — a permission matrix nobody asked for
  -- is how this kind of table becomes unmaintainable.
  role text not null default 'owner' check (role in ('owner', 'manager')),

  created_at timestamptz not null default now(),

  primary key (account_id, member_id),
  -- A person acting as themselves is implicit and must not be stored, or every
  -- query has to remember to deduplicate it.
  constraint account_members_not_self check (account_id <> member_id)
);

create index account_members_member_idx on account_members (member_id);

alter table account_members enable row level security;

-- You can see the memberships of accounts you are a member of, and your own.
create policy "members see their own memberships"
  on account_members for select
  using (member_id = auth.uid() or auth_is_admin());

comment on table account_members is
  'Who may act as which account. A person acting as themselves is implicit and never stored.';

-- =============================================================================
-- auth_can_act_as
-- =============================================================================
-- The building block for every future policy that has to answer "is this person
-- allowed to do this as that account". Not wired into the existing hosting
-- policies yet — doing that is a separate, careful change across events,
-- services and availability, and it should land on its own so it can be
-- reviewed on its own.

create or replace function auth_can_act_as(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_account = auth.uid()
      or exists (
        select 1 from account_members
         where account_id = p_account
           and member_id  = auth.uid()
      );
$$;

comment on function auth_can_act_as is
  'True when the signed-in person may act as the given account — themselves, or an account they are a member of.';

revoke execute on function auth_can_act_as(uuid) from anon;

-- =============================================================================
-- list_my_accounts
-- =============================================================================
-- Everything the switcher shows: the person themselves first, then the accounts
-- they administer, alphabetically. Security definer so it can read the profile
-- rows of accounts the caller may act as without widening the `profiles` select
-- policy for everyone.

create or replace function list_my_accounts()
returns table (
  id           uuid,
  display_name text,
  handle       text,
  avatar_url   text,
  account_type account_type,
  role         text,
  is_self      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.handle::text, p.avatar_url, p.account_type,
         'owner'::text as role, true as is_self
    from profiles p
   where p.id = auth.uid()

  union all

  select p.id, p.display_name, p.handle::text, p.avatar_url, p.account_type,
         m.role, false
    from account_members m
    join profiles p on p.id = m.account_id
   where m.member_id = auth.uid()

  -- Self first, then by name. `is_self desc` puts true above false.
   order by is_self desc, display_name;
$$;

comment on function list_my_accounts is
  'The accounts the signed-in person can switch between. Themselves first.';

revoke execute on function list_my_accounts() from anon;
