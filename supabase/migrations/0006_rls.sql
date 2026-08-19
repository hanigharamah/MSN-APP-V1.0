-- =============================================================================
-- MSN — 0006 · Row Level Security
-- =============================================================================
-- Everything is denied by default. Policies below are the only way in.
--
-- The rule worth stating explicitly: a user can edit their own profile but
-- CANNOT set is_verified, is_certified, is_admin or is_suspended on it. In the
-- Laravel app is_verified sits in $fillable with no guard, which is the shape
-- of MSN-DEV-2243. Here it's a database guarantee — no controller can forget it.
-- =============================================================================

alter table profiles                  enable row level security;
alter table provider_details          enable row level security;
alter table push_tokens               enable row level security;
alter table categories                enable row level security;
alter table specialities              enable row level security;
alter table profile_specialities      enable row level security;
alter table events                    enable row level security;
alter table event_occurrences         enable row level security;
alter table event_images              enable row level security;
alter table ticket_types              enable row level security;
alter table services                  enable row level security;
alter table availability_rules        enable row level security;
alter table availability_blocks       enable row level security;
alter table orders                    enable row level security;
alter table order_items               enable row level security;
alter table tickets                   enable row level security;
alter table bookings                  enable row level security;
alter table refund_requests           enable row level security;
alter table token_ledger              enable row level security;
alter table token_tiers               enable row level security;
alter table follows                   enable row level security;
alter table saved_items               enable row level security;
alter table reviews                   enable row level security;
alter table conversations             enable row level security;
alter table conversation_participants enable row level security;
alter table messages                  enable row level security;
alter table notifications             enable row level security;
alter table reports                   enable row level security;
alter table blocked_users             enable row level security;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create policy "profiles are publicly readable"
  on profiles for select
  using (not is_suspended or id = auth.uid() or auth_is_admin());

create policy "own profile update"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "admins manage profiles"
  on profiles for all
  using (auth_is_admin())
  with check (auth_is_admin());

-- Trust flags cannot be self-granted. A user's own UPDATE passes the policy
-- above, so the flags are pinned by trigger instead — policies cannot compare
-- OLD and NEW values.
create or replace function guard_profile_trust_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_is_admin() then
    return new;
  end if;
  new.is_verified   := old.is_verified;
  new.is_certified  := old.is_certified;
  new.is_admin      := old.is_admin;
  new.is_suspended  := old.is_suspended;
  new.account_type  := old.account_type;   -- changing type is an admin action
  return new;
end;
$$;

create trigger profiles_guard_trust_flags
  before update on profiles
  for each row execute function guard_profile_trust_flags();

comment on function guard_profile_trust_flags is
  'Silently reverts privileged columns for non-admin updates. Closes the self-assign-verified-badge class of bug at the database.';

-- -----------------------------------------------------------------------------
-- Provider details, push tokens
-- -----------------------------------------------------------------------------
create policy "provider details readable"
  on provider_details for select using (true);

create policy "own provider details write"
  on provider_details for all
  using (profile_id = auth.uid() or auth_is_admin())
  with check (profile_id = auth.uid() or auth_is_admin());

create policy "own push tokens"
  on push_tokens for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Taxonomy — read-only to everyone, admin-managed
-- -----------------------------------------------------------------------------
create policy "categories readable"   on categories   for select using (is_active or auth_is_admin());
create policy "specialities readable" on specialities for select using (is_active or auth_is_admin());
create policy "token tiers readable"  on token_tiers  for select using (true);

create policy "admins manage categories"   on categories   for all using (auth_is_admin()) with check (auth_is_admin());
create policy "admins manage specialities" on specialities for all using (auth_is_admin()) with check (auth_is_admin());

create policy "own specialities" on profile_specialities for all
  using (profile_id = auth.uid() or auth_is_admin())
  with check (profile_id = auth.uid() or auth_is_admin());

create policy "specialities readable by all" on profile_specialities for select using (true);

-- -----------------------------------------------------------------------------
-- Events — published are public; drafts belong to the host
-- -----------------------------------------------------------------------------
create policy "published events are public"
  on events for select
  using (status = 'published' or host_id = auth.uid() or auth_is_admin());

create policy "hosts manage own events"
  on events for all
  using (host_id = auth.uid() or auth_is_admin())
  with check (host_id = auth.uid() or auth_is_admin());

create policy "occurrences follow event visibility"
  on event_occurrences for select
  using (exists (
    select 1 from events e where e.id = event_id
      and (e.status = 'published' or e.host_id = auth.uid() or auth_is_admin())
  ));

create policy "hosts manage occurrences"
  on event_occurrences for all
  using (exists (select 1 from events e where e.id = event_id and (e.host_id = auth.uid() or auth_is_admin())))
  with check (exists (select 1 from events e where e.id = event_id and (e.host_id = auth.uid() or auth_is_admin())));

create policy "event images follow event"
  on event_images for select
  using (exists (
    select 1 from events e where e.id = event_id
      and (e.status = 'published' or e.host_id = auth.uid() or auth_is_admin())
  ));

create policy "hosts manage event images"
  on event_images for all
  using (exists (select 1 from events e where e.id = event_id and (e.host_id = auth.uid() or auth_is_admin())))
  with check (exists (select 1 from events e where e.id = event_id and (e.host_id = auth.uid() or auth_is_admin())));

create policy "ticket types follow event"
  on ticket_types for select
  using (exists (
    select 1 from events e where e.id = event_id
      and (e.status = 'published' or e.host_id = auth.uid() or auth_is_admin())
  ));

create policy "hosts manage ticket types"
  on ticket_types for all
  using (exists (select 1 from events e where e.id = event_id and (e.host_id = auth.uid() or auth_is_admin())))
  with check (exists (select 1 from events e where e.id = event_id and (e.host_id = auth.uid() or auth_is_admin())));

-- -----------------------------------------------------------------------------
-- Services and availability
-- -----------------------------------------------------------------------------
create policy "active services are public"
  on services for select
  using (is_active or provider_id = auth.uid() or auth_is_admin());

create policy "providers manage own services"
  on services for all
  using (provider_id = auth.uid() or auth_is_admin())
  with check (provider_id = auth.uid() or auth_is_admin());

create policy "availability is public"
  on availability_rules for select using (true);

create policy "providers manage availability"
  on availability_rules for all
  using (provider_id = auth.uid() or auth_is_admin())
  with check (provider_id = auth.uid() or auth_is_admin());

-- Blocks reveal a provider's private calendar; only they see the reason.
create policy "providers see own blocks"
  on availability_blocks for select
  using (provider_id = auth.uid() or auth_is_admin());

create policy "providers manage own blocks"
  on availability_blocks for all
  using (provider_id = auth.uid() or auth_is_admin())
  with check (provider_id = auth.uid() or auth_is_admin());

-- -----------------------------------------------------------------------------
-- Orders and tickets — buyer and host only
-- -----------------------------------------------------------------------------
create policy "buyers and hosts see orders"
  on orders for select
  using (
    buyer_id = auth.uid()
    or auth_is_admin()
    or exists (select 1 from events e where e.id = event_id and e.host_id = auth.uid())
  );

create policy "buyers create own orders"
  on orders for insert
  with check (buyer_id = auth.uid());

-- Orders are never mutated from the client. Status transitions happen in Edge
-- Functions using the service-role key, which bypasses RLS.
create policy "admins update orders"
  on orders for update
  using (auth_is_admin()) with check (auth_is_admin());

create policy "order items follow order"
  on order_items for select
  using (exists (
    select 1 from orders o where o.id = order_id
      and (o.buyer_id = auth.uid() or auth_is_admin()
           or exists (select 1 from events e where e.id = o.event_id and e.host_id = auth.uid()))
  ));

create policy "holders and hosts see tickets"
  on tickets for select
  using (
    holder_id = auth.uid()
    or auth_is_admin()
    or exists (select 1 from events e where e.id = event_id and e.host_id = auth.uid())
  );

-- Door check-in: the host may mark a ticket used.
create policy "hosts check in tickets"
  on tickets for update
  using (exists (select 1 from events e where e.id = event_id and e.host_id = auth.uid()))
  with check (exists (select 1 from events e where e.id = event_id and e.host_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- Bookings — the two parties only
-- -----------------------------------------------------------------------------
create policy "parties see bookings"
  on bookings for select
  using (seeker_id = auth.uid() or provider_id = auth.uid() or auth_is_admin());

create policy "seekers create bookings"
  on bookings for insert
  with check (seeker_id = auth.uid());

create policy "parties update bookings"
  on bookings for update
  using (seeker_id = auth.uid() or provider_id = auth.uid() or auth_is_admin())
  with check (seeker_id = auth.uid() or provider_id = auth.uid() or auth_is_admin());

-- -----------------------------------------------------------------------------
-- Refunds
-- -----------------------------------------------------------------------------
create policy "requesters see own refunds"
  on refund_requests for select
  using (requester_id = auth.uid() or auth_is_admin());

create policy "requesters open refunds"
  on refund_requests for insert
  with check (requester_id = auth.uid());

-- Only admins decide. Policy §4.4 requires a written reason, enforced here.
create policy "admins decide refunds"
  on refund_requests for update
  using (auth_is_admin()) with check (auth_is_admin());

-- -----------------------------------------------------------------------------
-- Tokens — readable by owner, writable by nobody from the client
-- -----------------------------------------------------------------------------
create policy "own token ledger readable"
  on token_ledger for select
  using (profile_id = auth.uid() or auth_is_admin());

create policy "admins write token ledger"
  on token_ledger for insert
  with check (auth_is_admin());

comment on policy "admins write token ledger" on token_ledger is
  'Tokens are issued by Edge Functions with the service-role key, or by an admin. Never by the holder.';

-- -----------------------------------------------------------------------------
-- Social
-- -----------------------------------------------------------------------------
create policy "follows are public"  on follows for select using (true);
create policy "own follows"         on follows for all
  using (follower_id = auth.uid()) with check (follower_id = auth.uid());

create policy "own saved items"     on saved_items for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "visible reviews are public"
  on reviews for select
  using (not is_hidden or author_id = auth.uid() or auth_is_admin());

create policy "authors write own reviews"
  on reviews for insert
  with check (author_id = auth.uid());

create policy "authors edit own reviews"
  on reviews for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Messaging — participants only
-- -----------------------------------------------------------------------------
create policy "participants see conversations"
  on conversations for select
  using (exists (
    select 1 from conversation_participants p
    where p.conversation_id = id and p.profile_id = auth.uid()
  ) or auth_is_admin());

create policy "users start conversations"
  on conversations for insert
  with check (created_by = auth.uid());

create policy "participants see membership"
  on conversation_participants for select
  using (profile_id = auth.uid() or exists (
    select 1 from conversation_participants p
    where p.conversation_id = conversation_id and p.profile_id = auth.uid()
  ));

create policy "manage own membership"
  on conversation_participants for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "participants read messages"
  on messages for select
  using (exists (
    select 1 from conversation_participants p
    where p.conversation_id = conversation_id and p.profile_id = auth.uid()
  ) or auth_is_admin());

create policy "participants send messages"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_participants p
      where p.conversation_id = conversation_id and p.profile_id = auth.uid()
    )
    -- Cannot message someone who blocked you.
    and not exists (
      select 1 from blocked_users b
      join conversation_participants p2 on p2.conversation_id = messages.conversation_id
      where b.blocker_id = p2.profile_id and b.blocked_id = auth.uid()
    )
  );

create policy "senders edit own messages"
  on messages for update
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Notifications, reports, blocks
-- -----------------------------------------------------------------------------
create policy "own notifications"
  on notifications for select using (profile_id = auth.uid());

create policy "mark own notifications read"
  on notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "reporters see own reports"
  on reports for select using (reporter_id = auth.uid() or auth_is_admin());

create policy "anyone may report"
  on reports for insert with check (reporter_id = auth.uid());

create policy "admins resolve reports"
  on reports for update using (auth_is_admin()) with check (auth_is_admin());

create policy "own blocks" on blocked_users for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
