-- Tell people when they get a message.
--
-- The old Laravel app notifies on chat messages in three places; this app did
-- not notify at all. Every other notable event here already raises a
-- notification from an Edge Function, but messages are inserted straight from
-- the client under RLS — there is no function to hang it off — so it belongs in
-- a trigger.
--
-- ## What it deliberately does not do
--
--   * **Does not notify the sender.** Obvious, and easy to get wrong when the
--     participants query is written as "everyone in the conversation".
--   * **Respects mute.** `conversation_participants.is_muted` exists and had no
--     effect on anything until now.
--   * **Respects blocks, both directions.** Somebody who has blocked you should
--     not be pinged by you, and — less obviously — you should not be pinged by
--     somebody you blocked, or blocking them would still let them reach your
--     lock screen.
--   * **Does not dedupe.** Every message notifies. A conversation is a
--     sequence, and collapsing it would mean somebody sees "1 new message" for
--     six.
--
-- ## The preview is deliberately short
--
-- 120 characters. A push notification renders on a lock screen, in public, and
-- the full text of a message about somebody's health does not belong there.

create or replace function notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  recipient   record;
begin
  -- A deleted message never happened, and an empty one is an attachment whose
  -- own row will follow.
  if new.deleted_at is not null then
    return new;
  end if;

  select display_name into sender_name from profiles where id = new.sender_id;

  for recipient in
    select cp.profile_id
      from conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.profile_id <> new.sender_id
       and not cp.is_muted
       and not exists (
         select 1 from blocked_users b
          where (b.blocker_id = cp.profile_id and b.blocked_id = new.sender_id)
             or (b.blocker_id = new.sender_id and b.blocked_id = cp.profile_id)
       )
  loop
    insert into notifications (profile_id, kind, title, body, deep_link, payload)
    values (
      recipient.profile_id,
      'message_received',
      coalesce(sender_name, 'Someone') || ' sent you a message',
      case
        when new.body is null or btrim(new.body) = '' then 'Sent an attachment'
        when length(new.body) > 120 then left(new.body, 117) || '…'
        else new.body
      end,
      'msn://conversation/' || new.conversation_id,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'message_id', new.id,
        'sender_id', new.sender_id
      )
    );
  end loop;

  return new;
end
$$;

create trigger messages_notify_recipients
  after insert on messages
  for each row execute function notify_new_message();

comment on function notify_new_message is
  'Raises a notification for every participant except the sender, skipping muted threads and blocks in both directions.';
