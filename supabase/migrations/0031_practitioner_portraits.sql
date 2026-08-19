-- Give the people faces.
--
-- The demo avatars came from `picsum.photos`, which is landscape photography —
-- churches, bike racks, forests. That was survivable when the avatar was a 48pt
-- circle beside a name. It is not survivable now that Discover gives the
-- practitioner's photo the whole top of a grid card: the most prominent thing
-- on the screen was a parked bicycle representing a somatic therapist.
--
-- ## Who gets a face, and who does not
--
-- Only `practitioner` accounts. A venue, a business, a nonprofit and an
-- organizer are not people — The Hollow Barn should look like a barn, and
-- swapping in a portrait would be a worse picture, not a better one. Those keep
-- the photographs they have.
--
-- ## On the assignment being arbitrary
--
-- Faces are assigned by handle to a fixed image number, so each practitioner
-- keeps the same face across reloads. The numbers are NOT chosen to match the
-- names. Picking a face to "suit" a name means inferring how someone looks from
-- what they are called, which is guesswork about ethnicity and gender that this
-- product has no business encoding — least of all in seed data that people will
-- read as representative. Distinct and stable is the whole requirement.
--
-- Demo data only: these are stock portraits from a placeholder service, not
-- photographs of MSN practitioners. Real accounts upload their own, which is
-- what `avatars` storage is for.

update profiles set avatar_url = 'https://i.pravatar.cc/600?img=47' where handle = 'amara'   and account_type = 'practitioner';
update profiles set avatar_url = 'https://i.pravatar.cc/600?img=12' where handle = 'joaquin' and account_type = 'practitioner';
update profiles set avatar_url = 'https://i.pravatar.cc/600?img=33' where handle = 'nour'    and account_type = 'practitioner';
update profiles set avatar_url = 'https://i.pravatar.cc/600?img=26' where handle = 'maya'    and account_type = 'practitioner';
update profiles set avatar_url = 'https://i.pravatar.cc/600?img=59' where handle = 'tomas'   and account_type = 'practitioner';

-- Kaya is an `organizer` — a named person who runs events rather than a venue,
-- so a face is right here too.
update profiles set avatar_url = 'https://i.pravatar.cc/600?img=64' where handle = 'kaya';

-- Anyone else who is a practitioner and still has a landscape avatar, keyed off
-- their id so each keeps a distinct, stable face. Catches accounts added after
-- this was written without needing another migration.
update profiles
   set avatar_url = 'https://i.pravatar.cc/600?img=' ||
       -- 1..70 is pravatar's range. `abs` because hashtext is signed.
       ((abs(hashtext(id::text)) % 70) + 1)::text
 where account_type = 'practitioner'
   and (avatar_url is null or avatar_url like '%picsum.photos%');
