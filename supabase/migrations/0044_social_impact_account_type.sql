-- Add `social_impact` to the account types.
--
-- The taxonomy the product expects has a Social Impact Organisation as a peer
-- of Nonprofit under an umbrella of mission-driven entities. The new app's enum
-- never had one. The old Laravel app does — as `social-impects`, misspelt in
-- the code itself, which is worth knowing about before anybody writes a
-- migration that tries to match on the string.
--
-- Alone in its own migration on purpose: Postgres will not let a value added to
-- an enum be USED in the same transaction that added it, so the table and
-- function work that depends on it lives in 0045.

alter type account_type add value if not exists 'social_impact';
