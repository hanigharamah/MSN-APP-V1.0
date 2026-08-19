-- Photo consent is per person per event, not per ticket.
--
-- Found in UAT: an account holding two tickets to the same session was shown
-- the identical card twice in a row — answer it, and the same question comes
-- straight back with a different ticket id behind it. The notification trigger
-- already deduplicated per event; the card did not.
--
-- The underlying mistake was modelling consent on the ticket because that is
-- where the column lives. What is actually being consented to is "photographs
-- of me, at this session" — one person, one event, one answer, however many
-- seats they bought.
--
-- The per-ticket function stays: it is the right shape for changing one answer
-- from one ticket later. This is the one the card uses.

create or replace function set_event_photo_consent(p_event uuid, p_consent boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer;
begin
  if p_consent is null then
    raise exception 'A consent answer has to be yes or no.'
      using errcode = '22004';
  end if;

  update tickets
     set photo_consent    = p_consent,
         photo_consent_at = now()
   where event_id = p_event
     and holder_id = auth.uid()
     and is_void = false;

  get diagnostics touched = row_count;

  if touched = 0 then
    raise exception 'You have no ticket for that session.'
      using errcode = '42501';
  end if;

  return touched;
end;
$$;

comment on function set_event_photo_consent is
  'One answer covering every ticket this person holds for one event. Reversible, and callable again to change the answer.';

revoke execute on function set_event_photo_consent(uuid, boolean) from anon;
