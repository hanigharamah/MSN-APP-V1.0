-- Starting a conversation has never worked.
--
-- ## The bug
--
-- `manage own membership` (0015) is `profile_id = auth.uid()` FOR ALL, so a
-- person may only ever insert their OWN participant row. That is right for
-- leaving a conversation and right as a default — but `createConversation`
-- inserts two rows, one per participant, and the second is refused. Tapping
-- "Message" on a practitioner's profile returned "You do not have permission to
-- do that", every time, for everybody.
--
-- The existing threads in the app were seeded directly into the database, which
-- is why the messaging screens looked healthy while the only route INTO them
-- was closed.
--
-- ## Why a function rather than a looser policy
--
-- The tempting fix is to let people insert participant rows for others when
-- they created the conversation. That would work and it would also let anyone
-- add anyone to any conversation they own — a stranger could put you in a
-- thread you never agreed to. The narrow version is a function that creates
-- exactly one shape of thing and checks everything on the way.
--
-- It also makes the operation atomic. The client did conversation-then-
-- participants in two round trips, so a failure between them left an orphan
-- conversation with one participant, invisible to everyone and impossible to
-- clean up from the app.
--
-- ## What it refuses
--
--   - Talking to yourself.
--   - Either direction of a block. `messages` already refuses the INSERT under
--     its own policy, so without this you could open a composer that could
--     never send — a working-looking screen that fails on the first message.
--   - Anything but a direct, two-person thread. Group creation is not a
--     product feature yet, and a function that can make one is a function that
--     can be misused before the UI exists to justify it.
--
-- Returns the EXISTING thread when there is one, so the button is idempotent:
-- tapping Message twice lands in the same conversation rather than making a
-- second empty one.

create or replace function start_direct_conversation(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  existing uuid;
  created  uuid;
begin
  if me is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  if p_other = me then
    raise exception 'You cannot message yourself.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from profiles where id = p_other) then
    raise exception 'No such person.' using errcode = 'P0002';
  end if;

  -- Either direction. Being blocked BY someone must stop this too, or the
  -- blocked person gets a composer that silently cannot send.
  if exists (
    select 1 from blocked_users
    where (blocker_id = me and blocked_id = p_other)
       or (blocker_id = p_other and blocked_id = me)
  ) then
    raise exception 'You cannot message this person.' using errcode = '42501';
  end if;

  -- Reuse rather than duplicate: a direct thread that already has exactly the
  -- two of us in it.
  select c.id into existing
  from conversations c
  where c.kind = 'direct'
    and exists (
      select 1 from conversation_participants p
      where p.conversation_id = c.id and p.profile_id = me
    )
    and exists (
      select 1 from conversation_participants p
      where p.conversation_id = c.id and p.profile_id = p_other
    )
    and (
      select count(*) from conversation_participants p where p.conversation_id = c.id
    ) = 2
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into conversations (kind, created_by)
  values ('direct', me)
  returning id into created;

  insert into conversation_participants (conversation_id, profile_id)
  values (created, me), (created, p_other);

  return created;
end;
$$;

comment on function start_direct_conversation is
  'Creates or returns the direct thread between the caller and one other person. Atomic, idempotent, and refuses self-conversations and blocks in either direction. Exists because the participants policy correctly allows inserting only your OWN row, which made two-party creation impossible from the client.';

revoke execute on function start_direct_conversation(uuid) from anon;
