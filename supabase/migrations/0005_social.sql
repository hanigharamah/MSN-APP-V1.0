-- =============================================================================
-- MSN — 0005 · Social, messaging, notifications
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Follows and saves
-- -----------------------------------------------------------------------------
create table follows (
  follower_id   uuid not null references profiles(id) on delete cascade,
  followed_id   uuid not null references profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint no_self_follow check (follower_id <> followed_id)
);

create index follows_followed_idx on follows (followed_id);

create table saved_items (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  event_id    uuid references events(id) on delete cascade,
  service_id  uuid references services(id) on delete cascade,
  provider_id uuid references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),

  constraint saved_targets_one_thing check (
    (event_id is not null)::int + (service_id is not null)::int + (provider_id is not null)::int = 1
  )
);

create unique index saved_event_uniq    on saved_items (profile_id, event_id)    where event_id is not null;
create unique index saved_service_uniq  on saved_items (profile_id, service_id)  where service_id is not null;
create unique index saved_provider_uniq on saved_items (profile_id, provider_id) where provider_id is not null;

-- -----------------------------------------------------------------------------
-- Reviews — only from people who actually attended
-- -----------------------------------------------------------------------------
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references profiles(id) on delete cascade,
  subject_id    uuid not null references profiles(id) on delete cascade,

  order_id      uuid references orders(id) on delete set null,
  booking_id    uuid references bookings(id) on delete set null,

  rating        smallint not null check (rating between 1 and 5),
  body          text,

  is_hidden     boolean not null default false,
  hidden_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint no_self_review check (author_id <> subject_id),
  -- Anchored to a real transaction. Prevents drive-by ratings.
  constraint review_needs_transaction check (order_id is not null or booking_id is not null)
);

create unique index reviews_one_per_order   on reviews (author_id, order_id)   where order_id is not null;
create unique index reviews_one_per_booking on reviews (author_id, booking_id) where booking_id is not null;
create index reviews_subject_idx on reviews (subject_id) where not is_hidden;

create trigger reviews_set_updated_at
  before update on reviews
  for each row execute function set_updated_at();

-- Cheap aggregate for profile screens.
create or replace function provider_rating(p_profile uuid)
returns table (average numeric, total bigint)
language sql
stable
as $$
  select round(avg(rating)::numeric, 2), count(*)
  from reviews where subject_id = p_profile and not is_hidden;
$$;

-- -----------------------------------------------------------------------------
-- Messaging — Supabase Realtime replaces Pusher for the app
-- -----------------------------------------------------------------------------
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  kind          conversation_kind not null default 'direct',
  event_id      uuid references events(id) on delete cascade,
  booking_id    uuid references bookings(id) on delete cascade,
  created_by    uuid references profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at    timestamptz not null default now()
);

create index conversations_recent_idx on conversations (last_message_at desc nulls last);

create table conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id      uuid not null references profiles(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  is_muted        boolean not null default false,
  primary key (conversation_id, profile_id)
);

create index conversation_participants_profile_idx on conversation_participants (profile_id);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references profiles(id) on delete cascade,

  body            text,
  attachment_url  text,
  attachment_type text,

  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),

  constraint message_has_content check (body is not null or attachment_url is not null)
);

create index messages_conversation_idx on messages (conversation_id, created_at desc);

-- Keep the conversation list ordered without a client round-trip.
create or replace function bump_conversation()
returns trigger
language plpgsql
as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_bump_conversation
  after insert on messages
  for each row execute function bump_conversation();

-- Publish messages over Realtime so the app gets live updates.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,

  kind          text not null,      -- 'booking_confirmed', 'event_cancelled', ...
  title         text not null,
  body          text,
  deep_link     text,               -- msn://event/<id>
  payload       jsonb not null default '{}'::jsonb,

  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index notifications_unread_idx on notifications (profile_id, created_at desc)
  where read_at is null;

alter publication supabase_realtime add table notifications;

-- -----------------------------------------------------------------------------
-- Reporting
-- -----------------------------------------------------------------------------
create table reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references profiles(id) on delete cascade,

  subject_profile_id uuid references profiles(id) on delete cascade,
  subject_event_id   uuid references events(id) on delete cascade,
  subject_message_id uuid references messages(id) on delete cascade,

  reason        text not null,
  detail        text,
  resolved_at   timestamptz,
  resolved_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint report_targets_one_thing check (
    (subject_profile_id is not null)::int
  + (subject_event_id   is not null)::int
  + (subject_message_id is not null)::int = 1
  )
);

create table blocked_users (
  blocker_id  uuid not null references profiles(id) on delete cascade,
  blocked_id  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
