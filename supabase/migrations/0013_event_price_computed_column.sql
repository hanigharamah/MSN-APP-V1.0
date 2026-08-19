-- =============================================================================
-- MSN — 0013 · Expose min_price_cents on `events` as a computed column
-- =============================================================================
-- `search_events` (0012) returns min_price_cents, but Discover reads events two
-- ways: the RPC when there is a text query, and a plain `from('events')` select
-- for a browse. Only the RPC had a price, so the card said "Ticketed" on the
-- browse path and would have said "From $22" the moment you typed — the card
-- changing shape under the user.
--
-- The obvious fix — embed `ticket_types` and compute the minimum in TypeScript
-- — would restate the buyability rules (active, inside the sales window, not
-- sold out) in a second language. That is the same shape as the availability
-- logic already duplicated between `available_slots` and `book-service`, which
-- drifted within a day of being written. Not repeating it.
--
-- Instead: a PostgREST computed column. A function whose single argument is the
-- table's row type is selectable as if it were a column —
-- `select=*,min_price_cents` — so both paths share one definition.
-- =============================================================================

create or replace function min_price_cents(events)
returns integer
language sql
stable
as $$
  select event_min_price_cents($1.id);
$$;

comment on function min_price_cents(events) is
  'PostgREST computed column. Select as `min_price_cents` on any events query. Delegates to event_min_price_cents so the browse path and search_events cannot disagree. Null means nothing is currently on sale, which is NOT the same as free.';
