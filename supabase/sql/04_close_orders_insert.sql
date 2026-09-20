-- Close the anonymous order-injection hole.
--
-- The existing policy:
--     "Users insert orders"  INSERT  TO public
--     with check ((auth.uid() = user_id) OR (user_id IS NULL))
--
-- "TO public" includes the anon role, and the "user_id IS NULL" branch needs
-- no session at all. So anyone holding the publishable key - which ships in
-- the browser bundle by design - can POST arbitrary rows into orders: any
-- total, any status, including 'delivered' and 'paid'. They cannot read,
-- update or delete; the damage is junk orders appearing in the dashboard
-- beside real ones.
--
-- Real orders are created by the `create-order` edge function
-- (src/pages/checkout.astro), so no storefront path needs anonymous insert.
--
-- The change is deliberately minimal: same expression, restricted to the
-- authenticated role. The "user_id IS NULL" branch is KEPT so that if the
-- edge function inserts on behalf of a signed-in user without setting
-- user_id, checkout keeps working exactly as it does today. If that function
-- uses the service role it bypasses RLS and is unaffected either way.

begin;

drop policy if exists "Users insert orders" on public.orders;

create policy "Users insert orders" on public.orders
  for insert to authenticated
  with check ((auth.uid() = user_id) OR (user_id IS NULL));

commit;
