-- Let `start_direct_conversation` carry a booking.
--
-- 0029 fixed the "Message" button on a practitioner's profile. The other route
-- into messaging — "Message" on a booking — has the same broken two-insert
-- shape and additionally ties the thread to the booking it came from, so that
-- opening it later continues the same conversation.
--
-- Dropped and recreated rather than overloaded: adding a defaulted parameter
-- with `create or replace` leaves BOTH signatures callable, and a call with one
-- argument then resolves by luck.
--
-- Reuse order matters and mirrors what the client used to do:
--
--   1. A thread already tied to this booking. Exact match, always preferred.
--   2. Any direct thread with the same person. Messaging someone you are
--      already talking to should continue that conversation rather than open a
--      parallel one beside it.
--   3. Otherwise create — as a booking thread when a booking was given.

drop function if exists start_direct_conversation(uuid);

create function start_direct_conversation(p_other uuid, p_booking uuid default null)
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

  -- Either direction: being blocked BY someone must stop this too, or the
  -- blocked person gets a composer that silently cannot send.
  if exists (
    select 1 from blocked_users
    where (blocker_id = me and blocked_id = p_other)
       or (blocker_id = p_other and blocked_id = me)
  ) then
    raise exception 'You cannot message this person.' using errcode = '42501';
  end if;

  -- 1 · Tied to this booking, and I am in it.
  if p_booking is not null then
    select c.id into existing
    from conversations c
    where c.booking_id = p_booking
      and exists (
        select 1 from conversation_participants p
        where p.conversation_id = c.id and p.profile_id = me
      )
    limit 1;

    if existing is not null then
      return existing;
    end if;
  end if;

  -- 2 · Any existing two-person direct thread with them.
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

  -- 3 · Create.
  insert into conversations (kind, created_by, booking_id)
  values (
    case when p_booking is null then 'direct' else 'booking' end::conversation_kind,
    me,
    p_booking
  )
  returning id into created;

  insert into conversation_participants (conversation_id, profile_id)
  values (created, me), (created, p_other);

  return created;
end;
$$;

comment on function start_direct_conversation is
  'Creates or returns the thread between the caller and one other person, optionally tied to a booking. Atomic, idempotent, refuses self-conversations and blocks in either direction.';

revoke execute on function start_direct_conversation(uuid, uuid) from anon;
