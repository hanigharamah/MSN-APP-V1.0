-- =============================================================================
-- MSN — 0015 · Fix messaging RLS: infinite recursion, a no-op predicate,
--              and a block check that could never see the blocking row
-- =============================================================================
-- Found by QA against the live database. Messaging was 100% non-functional:
-- every authenticated read of conversations, participants or messages returned
--
--     42P17 infinite recursion detected in policy for relation
--     "conversation_participants"
--
-- THE RECURSION. `0006` defined the SELECT policy on
-- `conversation_participants` as a subquery against `conversation_participants`.
-- Evaluating the policy requires reading the table, which requires evaluating
-- the policy. `conversations` and `messages` both subquery the same table, so
-- the failure propagated to every messaging read.
--
-- THE NO-OP. That subquery's `conversation_id` was unqualified, so it bound to
-- the subquery's own alias rather than the outer row — `p.conversation_id =
-- p.conversation_id`. Even without the recursion it scoped to nothing and
-- would have exposed every participant row to anyone who was a participant of
-- anything.
--
-- THE BLOCK CHECK. `"own blocks"` allowed SELECT only `where blocker_id =
-- auth.uid()`, so you could never see a block pointed AT you. `isBlockedBetween`
-- therefore returned false in exactly the case that matters, the composer
-- rendered, and the send was then refused by the `messages` policy with no
-- explanation.
--
-- THE FIX. A `security definer` helper answers "is the caller in this
-- conversation?" without the policy re-entering the table it guards. Same
-- pattern already used by `auth_is_admin()`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Membership helper
-- -----------------------------------------------------------------------------
create or replace function auth_in_conversation(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation
      and cp.profile_id = auth.uid()
  );
$$;

comment on function auth_in_conversation is
  'Is the caller a participant of this conversation? security definer so the conversation_participants policies can call it without recursing into themselves (42P17).';

-- -----------------------------------------------------------------------------
-- conversation_participants — the recursive one
-- -----------------------------------------------------------------------------
drop policy if exists "participants see membership" on conversation_participants;
drop policy if exists "manage own membership"      on conversation_participants;

create policy "participants see membership"
  on conversation_participants for select
  using (
    profile_id = auth.uid()
    or auth_in_conversation(conversation_id)
    or auth_is_admin()
  );

create policy "manage own membership"
  on conversation_participants for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------
drop policy if exists "participants see conversations" on conversations;

create policy "participants see conversations"
  on conversations for select
  using (auth_in_conversation(id) or auth_is_admin());

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
drop policy if exists "participants read messages"  on messages;
drop policy if exists "participants send messages"  on messages;

create policy "participants read messages"
  on messages for select
  using (auth_in_conversation(conversation_id) or auth_is_admin());

create policy "participants send messages"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and auth_in_conversation(conversation_id)
    -- Cannot message into a conversation where any other participant has
    -- blocked you. `blocked_users` is read here under the policy's own rights,
    -- which is why the client needs the RPC below rather than a direct select.
    and not exists (
      select 1
      from conversation_participants other
      join blocked_users b
        on b.blocker_id = other.profile_id
       and b.blocked_id = auth.uid()
      where other.conversation_id = messages.conversation_id
        and other.profile_id <> auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Blocks — answer the question without revealing the row
-- -----------------------------------------------------------------------------
-- Deliberately NOT loosening the SELECT policy. Letting someone read a block
-- pointed at them tells them they have been blocked, which is a safety
-- decision, not a technical one. A definer function answers the only question
-- the client actually needs — "can these two talk?" — without disclosing
-- direction or existence.
create or replace function is_blocked_between(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
       or (b.blocker_id = p_other    and b.blocked_id = auth.uid())
  );
$$;

comment on function is_blocked_between is
  'True when either party has blocked the other. security definer so the caller learns they cannot message someone without being able to read the blocking row — who blocked whom stays private.';
