-- Sunflora — admin access policies.
--
-- Purely ADDITIVE: every statement creates new, distinctly-named policies.
-- Existing policies are left in place, and because permissive policies are
-- OR-ed together, nothing anon can do today changes. The storefront's
-- anonymous read access is untouched.
--
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Admin test.
--    SECURITY DEFINER so that a policy ON profiles can call it without
--    recursing back through profiles' own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Catalog — admin gets full control; anon keeps its existing read access.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'products','product_images','product_sizes','product_colors',
    'product_details','product_includes','categories','reviews','review_photos',
    'customer_insights','customer_insight_options',
    'faqs','testimonials','gallery_items','site_settings'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, table not present', t; continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_manage_%1$s on public.%1$I', t);
    execute format(
      'create policy admin_manage_%1$s on public.%1$I
         for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Shop records — admin reads everything.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'orders','order_items','order_status_history','addresses',
    'custom_orders','custom_order_status_history',
    'contact_messages','newsletter_subscribers','profiles'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_read_%1$s on public.%1$I', t);
    execute format(
      'create policy admin_read_%1$s on public.%1$I
         for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Shop records — admin writes ONLY where she genuinely acts.
--    Deliberately no insert/update/delete policy for order_items or addresses:
--    those are a record of what happened.
-- ---------------------------------------------------------------------------
drop policy if exists admin_update_orders on public.orders;
create policy admin_update_orders on public.orders
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_append_order_history on public.order_status_history;
create policy admin_append_order_history on public.order_status_history
  for insert to authenticated with check (public.is_admin());

drop policy if exists admin_update_custom_orders on public.custom_orders;
create policy admin_update_custom_orders on public.custom_orders
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_append_custom_history on public.custom_order_status_history;
create policy admin_append_custom_history on public.custom_order_status_history
  for insert to authenticated with check (public.is_admin());

drop policy if exists admin_update_contact_messages on public.contact_messages;
create policy admin_update_contact_messages on public.contact_messages
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. A placed order is a financial record. Even an admin may not restate
--    what was charged — only move it through fulfilment.
--    service_role is exempt so whatever creates orders keeps working.
-- ---------------------------------------------------------------------------
create or replace function public.orders_protect_financials()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'service_role' then
    if new.total         is distinct from old.total
    or new.subtotal      is distinct from old.subtotal
    or new.discount      is distinct from old.discount
    or new.shipping_fee  is distinct from old.shipping_fee
    or new.order_number  is distinct from old.order_number
    or new.user_id       is distinct from old.user_id
    or new.created_at    is distinct from old.created_at then
      raise exception
        'This order''s amounts cannot be changed. Cancel it and create a new one instead.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_protect_financials on public.orders;
create trigger orders_protect_financials
  before update on public.orders
  for each row execute function public.orders_protect_financials();

commit;
