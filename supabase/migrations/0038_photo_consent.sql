-- Photo consent — permission to appear in photographs taken at a session.
--
-- Under UK/EU GDPR, consent to be photographed must be freely given, specific,
-- informed and unambiguous, and it must be as easy to withdraw as it was to
-- give. Three consequences shape this file:
--
--   1. It lives on the ticket, not the profile. Consent is specific to one
--      event. A blanket "yes to photos forever" is not consent to anything in
--      particular, and would not survive a challenge.
--   2. Three states, not two. NULL means nobody has answered yet, which is a
--      different thing from "no" and must never be read as either answer. A
--      practitioner looking at an unanswered attendee has to see "unknown",
--      because treating silence as permission is the whole failure mode.
--   3. `set_photo_consent` accepts a change in either direction, any number of
--      times. Withdrawal being harder than granting is the specific thing the
--      regulation prohibits.

alter table tickets
  add column photo_consent    boolean,
  add column photo_consent_at timestamptz;

-- An answer must record when it was given: that timestamp is the audit trail if
-- anybody ever has to show what a person agreed to, and on what date.
alter table tickets
  add constraint tickets_photo_consent_has_timestamp
  check ((photo_consent is null) = (photo_consent_at is null));

-- Partial index: the app asks "what is this person still owed a question about"
-- on every cold start, and that query only ever looks at unanswered rows.
create index tickets_photo_consent_pending_idx
  on tickets (holder_id)
  where photo_consent is null and is_void = false;

comment on column tickets.photo_consent is
  'NULL = not answered yet. Never treat NULL as consent.';

-- =============================================================================
-- set_photo_consent
-- =============================================================================
-- Security definer rather than an UPDATE policy on `tickets`. The existing
-- host policy already permits writing any column, and widening that to holders
-- would let a seeker edit `checked_in_at` on their own ticket — marking
-- themselves present at a session they did not attend. This function is the
-- only write a holder gets, and it can only touch the two consent columns.

create or replace function set_photo_consent(p_ticket uuid, p_consent boolean)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  updated tickets;
begin
  if p_consent is null then
    raise exception 'A consent answer has to be yes or no.'
      using errcode = '22004';
  end if;

  update tickets
     set photo_consent    = p_consent,
         -- Re-stamped on a change of mind: the date that matters is the date of
         -- the answer currently in force.
         photo_consent_at = now()
   where id = p_ticket
     and holder_id = auth.uid()
     and is_void = false
  returning * into updated;

  if updated.id is null then
    raise exception 'That ticket is not yours.'
      using errcode = '42501';
  end if;

  return updated;
end;
$$;

comment on function set_photo_consent is
  'Records or changes one holder''s photo consent for one ticket. Reversible by design — withdrawal must be as easy as granting.';

revoke execute on function set_photo_consent(uuid, boolean) from anon;

-- =============================================================================
-- The ask
-- =============================================================================
-- Raised as a notification the moment a ticket exists, which is also the moment
-- the app shows the card. The notification is what survives the person closing
-- the app before answering: it is already in their bell, and it is the row a
-- push would be sent from once push delivery exists.

create or replace function notify_photo_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Tickets bought for somebody without an account have nobody to ask.
  if new.holder_id is null then
    return new;
  end if;

  -- One ask per person per event, however many tickets they bought. Four
  -- notifications for a group booking would read as a malfunction.
  if exists (
    select 1 from notifications
     where profile_id = new.holder_id
       and kind = 'photo_consent'
       and payload->>'event_id' = new.event_id::text
  ) then
    return new;
  end if;

  insert into notifications (profile_id, kind, title, body, deep_link, payload)
  values (
    new.holder_id,
    'photo_consent',
    'A quick question about photos',
    'Your host may take photographs at this session. Let them know whether you are happy to appear in them.',
    'msn://event/' || new.event_id,
    jsonb_build_object('event_id', new.event_id, 'ticket_id', new.id)
  );

  return new;
end;
$$;

create trigger tickets_notify_photo_consent
  after insert on tickets
  for each row execute function notify_photo_consent();
