-- Demo imagery for the first-generation seed rows.
--
-- Two seed passes exist. The later one (`seed/demo_content.sql`) set a
-- `cover_url` on every event and an `avatar_url` on every profile it created.
-- The first pass did neither, so a handful of rows render as grey blocks and
-- initials — which reads as "the images are broken" rather than "this row is
-- older", and makes the whole product look half-built in a demo.
--
-- Idempotent and narrow on purpose: `where cover_url is null` means re-running
-- this never overwrites a real uploaded image, and rows added later that
-- genuinely have no picture are not silently given a stock one by a migration.
-- Same `picsum.photos/seed/<name>` convention as the later seed, so the images
-- are stable across reloads instead of reshuffling on every fetch.

update events set cover_url = 'https://picsum.photos/seed/msn-breathwork-circle/1200/600'
  where slug = 'breathwork-for-anxiety-online' and cover_url is null;

update events set cover_url = 'https://picsum.photos/seed/msn-solstice-gong/1200/600'
  where slug = 'gong-bath-winter-solstice' and cover_url is null;

-- Catch-all for any first-pass event the two statements above missed (a row
-- with a different slug, or no slug at all). Keyed off the id so each event
-- keeps its own stable picture rather than all sharing one.
update events set cover_url = 'https://picsum.photos/seed/msn-event-' || left(id::text, 8) || '/1200/600'
  where cover_url is null;

-- Faces. A marketplace whose practitioners have no photograph is a directory,
-- not a marketplace — and these four are the ones a seeker meets first.
update profiles set avatar_url = 'https://picsum.photos/seed/msn-maya/400/400'
  where handle = 'maya' and avatar_url is null;

update profiles set avatar_url = 'https://picsum.photos/seed/msn-tomas/400/400'
  where handle = 'tomas' and avatar_url is null;

update profiles set avatar_url = 'https://picsum.photos/seed/msn-greenhouse/400/400'
  where handle = 'greenhouse' and avatar_url is null;

-- The demo account you actually sign in as. It showed bare initials against a
-- marketplace full of photographed practitioners, which made the signed-in
-- experience look like the broken one.
update profiles set avatar_url = 'https://picsum.photos/seed/msn-demo-seeker/400/400'
  where handle = 'demo' and avatar_url is null;

update profiles set avatar_url = 'https://picsum.photos/seed/msn-person-' || left(id::text, 8) || '/400/400'
  where avatar_url is null;
