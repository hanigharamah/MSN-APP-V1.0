-- =============================================================================
-- MSN — 0007 · Storage buckets and object policies
-- =============================================================================
-- Path convention: the FIRST folder segment is the uuid that owns the object,
-- so a policy can authorise a write with a string comparison instead of a join.
--
--   avatars/<profile_id>/<file>
--   covers/<profile_id>/<file>
--   galleries/<profile_id>/<file>                        (optional album folder)
--   event-images/<host_profile_id>/<event_id>/<file>     (event_id optional)
--   message-attachments/<conversation_id>/<sender_id>/<file>
--
-- message-attachments is the one deliberate exception: access there is decided
-- by conversation membership, not by ownership, so the conversation id has to
-- come first. See the policies at the bottom.
--
-- Mime and size limits are enforced by the Storage API from storage.buckets —
-- an RLS policy cannot see the content type of an object that is still being
-- uploaded, so the bucket definition is the only place those can live.
--
-- NOTE: storage.objects already has RLS enabled by Supabase; this file only
-- adds policies. Run it as the `postgres` role (SQL editor or `db push`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Buckets
-- -----------------------------------------------------------------------------
-- Re-runnable: on conflict we resync the limits so this file stays the single
-- source of truth for what each bucket accepts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Small, square, shown everywhere. 5 MB is generous for an avatar.
  ('avatars', 'avatars', true, 5242880, array[
    'image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif'
  ]),

  -- Wide hero images on profile screens.
  ('covers', 'covers', true, 10485760, array[
    'image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif'
  ]),

  -- Event cover + gallery shots. Same ceiling as covers.
  ('event-images', 'event-images', true, 10485760, array[
    'image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif'
  ]),

  -- Practitioner portfolio galleries. Slightly larger to allow full-bleed work.
  ('galleries', 'galleries', true, 15728640, array[
    'image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif'
  ]),

  -- PRIVATE. Readable only through a signed URL obtained by a participant.
  -- Wider mime list because people send documents and voice notes, not just photos.
  ('message-attachments', 'message-attachments', false, 26214400, array[
    'image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif',
    'application/pdf',
    'audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav',
    'video/mp4','video/quicktime'
  ])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- avatars — public read, owner write
-- -----------------------------------------------------------------------------
-- `drop policy if exists` before each create keeps the whole file idempotent;
-- `create policy if not exists` does not exist in Postgres.

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "own avatar upload" on storage.objects;
create policy "own avatar upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    -- foldername('<uid>/pic.jpg') => {'<uid>'} — first segment must be the caller
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own avatar update" on storage.objects;
create policy "own avatar update"
  on storage.objects for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- covers — public read, owner write
-- -----------------------------------------------------------------------------
drop policy if exists "covers are publicly readable" on storage.objects;
create policy "covers are publicly readable"
  on storage.objects for select
  using (bucket_id = 'covers');

drop policy if exists "own cover upload" on storage.objects;
create policy "own cover upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own cover update" on storage.objects;
create policy "own cover update"
  on storage.objects for update to authenticated
  using      (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own cover delete" on storage.objects;
create policy "own cover delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- galleries — public read, owner write
-- -----------------------------------------------------------------------------
drop policy if exists "galleries are publicly readable" on storage.objects;
create policy "galleries are publicly readable"
  on storage.objects for select
  using (bucket_id = 'galleries');

drop policy if exists "own gallery upload" on storage.objects;
create policy "own gallery upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'galleries' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own gallery update" on storage.objects;
create policy "own gallery update"
  on storage.objects for update to authenticated
  using      (bucket_id = 'galleries' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'galleries' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own gallery delete" on storage.objects;
create policy "own gallery delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'galleries' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- event-images — public read, host write
-- -----------------------------------------------------------------------------
-- Two guards, because either one alone is too loose:
--   segment 1 = the caller           -> you can only write under your own prefix
--   segment 2 = an event you host    -> and only into a folder for your event
-- Segment 2 is optional so a host can stage an image before the event row
-- exists (draft flow). The `e.id::text = ...` comparison avoids a uuid cast
-- error on a segment that is not a uuid at all.

drop policy if exists "event images are publicly readable" on storage.objects;
create policy "event images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'event-images');

drop policy if exists "hosts upload event images" on storage.objects;
create policy "hosts upload event images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      coalesce(array_length(storage.foldername(name), 1), 0) < 2
      or exists (
        select 1 from public.events e
        where e.id::text = (storage.foldername(name))[2]
          and e.host_id = auth.uid()
      )
    )
  );

drop policy if exists "hosts update event images" on storage.objects;
create policy "hosts update event images"
  on storage.objects for update to authenticated
  using      (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "hosts delete event images" on storage.objects;
create policy "hosts delete event images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- message-attachments — PRIVATE, conversation participants only
-- -----------------------------------------------------------------------------
-- Path: <conversation_id>/<sender_id>/<file>
--
-- Deliberately NOT owner-first. Read access here is a property of the
-- conversation, not of the uploader — the recipient must be able to read a file
-- they did not upload, and nobody outside the conversation ever may. Putting
-- the conversation id first lets one membership check authorise the read.
--
-- The bucket is private, so a client fetches these through
-- createSignedUrl(); the select policy is what gates that call.

drop policy if exists "participants read message attachments" on storage.objects;
create policy "participants read message attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1]
        and cp.profile_id = auth.uid()
    )
  );

drop policy if exists "participants upload message attachments" on storage.objects;
create policy "participants upload message attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    -- must be a member of the conversation the file is filed under ...
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = (storage.foldername(name))[1]
        and cp.profile_id = auth.uid()
    )
    -- ... and must file it under their own sender folder, so an attachment can
    -- always be attributed to the account that uploaded it.
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- No UPDATE policy on purpose: a sent attachment is part of the message record.
-- Replacing bytes at a URL the other party has already seen is not a thing the
-- client should be able to do. Deleting your own is fine.
drop policy if exists "senders delete own message attachments" on storage.objects;
create policy "senders delete own message attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
