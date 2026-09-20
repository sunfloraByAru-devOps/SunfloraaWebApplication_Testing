-- Track when shop content last changed, so the dashboard can tell Aru that her
-- edits are not on the live site yet.
--
-- The storefront is statically rendered: product data and image URLs are baked
-- into the HTML at build time. Nothing she changes here appears publicly until
-- the site is rebuilt and redeployed. Without a visible signal she would change
-- a price, look at the shop, see the old price, and conclude this tool is broken.
--
-- This records a single timestamp. The dashboard compares it against the
-- timestamp baked into its own page at build time - if content is newer than
-- the build, there are unpublished changes.
--
-- Safe to re-run.

begin;

create or replace function public.touch_content_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  -- Writing our own marker back into site_settings would fire this trigger
  -- again, so bail out for that one row.
  if tg_table_name = 'site_settings' then
    v_key := coalesce(new.key, old.key);
    if v_key = 'content_changed_at' then
      return coalesce(new, old);
    end if;
  end if;

  insert into public.site_settings (key, value, label, updated_at)
  values ('content_changed_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'Last content change (used by the dashboard)', now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  return coalesce(new, old);
end $$;

-- Attach to everything the public site renders from.
do $$
declare t text;
begin
  foreach t in array array[
    'products', 'product_images', 'product_sizes', 'product_colors',
    'product_details', 'product_includes', 'categories', 'reviews',
    'faqs', 'testimonials', 'gallery_items', 'site_settings'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists touch_content_changed on public.%I', t);
    execute format(
      'create trigger touch_content_changed
         after insert or update or delete on public.%I
         for each row execute function public.touch_content_changed()', t);
  end loop;
end $$;

-- Seed it so the dashboard has something to compare against straight away.
insert into public.site_settings (key, value, label, updated_at)
values ('content_changed_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'Last content change (used by the dashboard)', now())
on conflict (key) do nothing;

commit;
