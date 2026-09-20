-- Sunflora — make the public custom-order form work again.
--
-- The form at /custom inserts as anon and is currently rejected by RLS, so
-- every request submitted on the live site is silently dropped.
--
-- The fix is deliberately NOT "give anon INSERT + SELECT on custom_orders":
-- the form reads back a reference number, and any SELECT policy broad enough
-- to allow that would also expose every other customer's request. Instead a
-- SECURITY DEFINER function accepts the submission and returns only the
-- reference number, so anon never gets read access to the table at all.
--
-- Safe to re-run.

begin;

create or replace function public.submit_custom_order(
  p_creation_name     text,
  p_size_label        text default '',
  p_email             text default '',
  p_phone             text default '',
  p_description       text default '',
  p_inspiration_path  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  if coalesce(btrim(p_creation_name), '') = '' then
    raise exception 'Please tell us what you would like made.';
  end if;

  if coalesce(btrim(p_email), '') = '' and coalesce(btrim(p_phone), '') = '' then
    raise exception 'Please leave an email address or a phone number.';
  end if;

  -- Length caps so the form cannot be used to push arbitrary volumes of text.
  insert into public.custom_orders (
    creation_name, size_label, email, phone, description, inspiration_path, status
  ) values (
    left(btrim(p_creation_name), 200),
    left(btrim(coalesce(p_size_label, '')), 100),
    left(btrim(coalesce(p_email, '')), 200),
    left(btrim(coalesce(p_phone, '')), 40),
    left(btrim(coalesce(p_description, '')), 5000),
    p_inspiration_path,
    'received'
  )
  returning ref_number into v_ref;

  return v_ref;
end $$;

revoke execute on function public.submit_custom_order(text,text,text,text,text,text) from public;
grant  execute on function public.submit_custom_order(text,text,text,text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: the inspiration image.
-- The bucket is already private, which is correct — only an admin may read it.
-- ---------------------------------------------------------------------------
drop policy if exists anon_upload_custom_inspiration on storage.objects;
create policy anon_upload_custom_inspiration on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'custom-order-uploads');

drop policy if exists admin_read_custom_inspiration on storage.objects;
create policy admin_read_custom_inspiration on storage.objects
  for select to authenticated
  using (bucket_id = 'custom-order-uploads' and public.is_admin());

-- Constrain what can be uploaded, since this is an unauthenticated write path.
update storage.buckets
   set file_size_limit    = 5242880,  -- 5 MB
       allowed_mime_types = array['image/png','image/jpeg','image/webp']
 where id = 'custom-order-uploads';

-- ---------------------------------------------------------------------------
-- Storage: admin manages the catalog buckets. These stay publicly readable —
-- the storefront renders from them.
-- ---------------------------------------------------------------------------
do $$
declare b text;
begin
  foreach b in array array['product-images','review-photos','gallery-images',
                           'site-images'] loop
    execute format('drop policy if exists admin_manage_%s on storage.objects',
                   replace(b, '-', '_'));
    execute format(
      'create policy admin_manage_%s on storage.objects
         for all to authenticated
         using (bucket_id = %L and public.is_admin())
         with check (bucket_id = %L and public.is_admin())',
      replace(b, '-', '_'), b, b);
  end loop;
end $$;

commit;
