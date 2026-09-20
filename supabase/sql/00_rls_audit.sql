-- Sunflora RLS audit — READ ONLY, changes nothing.
-- Run in: Supabase dashboard -> SQL Editor. Paste the output back.

-- 1. Which tables have RLS switched on?
select c.relname            as table_name,
       c.relrowsecurity     as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- 2. Every policy, with its USING / WITH CHECK expression.
select tablename, policyname, cmd, roles,
       qual        as using_expr,
       with_check  as with_check_expr
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3. Storage bucket config + storage policies.
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by name;

select policyname, cmd, roles, qual as using_expr, with_check as with_check_expr
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;

-- 4. Table-level grants to anon / authenticated (RLS only applies where a grant exists).
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 5. Do the customer-data tables actually hold rows? (Decides whether the
--    "anon sees 0 rows" result proves scoping or just reflects empty tables.)
select 'orders' t, count(*) from orders
union all select 'order_items', count(*) from order_items
union all select 'addresses', count(*) from addresses
union all select 'custom_orders', count(*) from custom_orders
union all select 'contact_messages', count(*) from contact_messages
union all select 'newsletter_subscribers', count(*) from newsletter_subscribers
union all select 'profiles', count(*) from profiles;

-- 6. Is there an admin-role helper already, and who is an admin?
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','auth') and p.proname ilike '%admin%';

select role, count(*) from profiles group by role;

-- 7. Enum types and their full value lists (needed for the status dropdowns).
select t.typname as enum_type,
       string_agg(e.enumlabel, ', ' order by e.enumsortorder) as values
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by t.typname
order by t.typname;

-- 8. FOCUS: which policies let anon write to orders / contact_messages /
--    newsletter_subscribers? Needed to remove the orders one without
--    disturbing the policy that lets a signed-in customer see their own orders.
select tablename, policyname, cmd, roles, permissive,
       qual as using_expr, with_check as with_check_expr
from pg_policies
where schemaname = 'public'
  and tablename in ('orders','order_items','contact_messages','newsletter_subscribers')
order by tablename, cmd, policyname;
