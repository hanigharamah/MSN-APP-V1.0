-- Extend the demo password to the demo admin.
--
-- 0024 set a known password on `%@demo.mysourcenetwork.test`. The demo ADMIN
-- account predates that convention and sits at `demo@msn.test`, so it was
-- missed — which means the admin half of the product cannot be signed into at
-- all, and therefore cannot be tested.
--
-- The safety argument is identical: `.test` is reserved by RFC 2606 for
-- exactly this purpose and never resolves, whatever the second-level label. No
-- mail can reach `msn.test` any more than it can reach
-- `demo.mysourcenetwork.test`, so neither can belong to a real person or be
-- recovered by anyone who does not already have database access.
--
-- Still scoped by the reserved TLD and nothing else. A live domain cannot
-- match, and this must never be extended to one.

do $$
declare
  touched integer;
begin
  update auth.users
     set encrypted_password = crypt('demo-password-1234', gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where email like '%@msn.test';

  get diagnostics touched = row_count;
  raise notice 'Demo admin password set on % account(s).', touched;
end
$$;
