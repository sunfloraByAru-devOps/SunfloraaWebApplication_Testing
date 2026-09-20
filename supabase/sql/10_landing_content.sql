-- Move the landing page's pictures out of four hardcoded .astro arrays and into
-- the database, so Aru can change them without a code change.
--
-- What was hardcoded, and what was wrong with it:
--
--   * LandingCategories.astro held four cards whose names, images and links
--     were three independent string literals. Two of them pointed at the wrong
--     category ("Flower Pots" -> ?category=Wall Hangings, "Cushions" ->
--     ?category=Keychains), so customers landed on the wrong shelf. Making the
--     cards read from this table fixes that by construction: one row, one name,
--     one link.
--
--   * LandingFounder.astro held eight community photos with hardcoded review
--     text, plus Aru's own portrait as a hot-linked WhatsApp CDN URL carrying a
--     signed expiry parameter. That URL will 404 on its own, with no warning and
--     no way for her to replace it.
--
--   * LandingBestSellers.astro and LandingNewArrivals.astro advertised ten
--     products that do not exist in this database, at prices nobody would
--     honour, in cards that linked nowhere. Three of their images were already
--     404ing. Those sections now render real catalog rows, curated by
--     products.home_section below.
--
-- Every image records its real pixel dimensions. That is not bookkeeping: the
-- storefront is statically rendered and Astro's <Image> can only optimise a
-- remote image when it is given width and height up front. Without them the
-- pictures ship unoptimised and shift the layout as they load.
--
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Category cards.
--    The image belongs on the category row, not in a shared image table keyed
--    by a hand-typed string - a text key that drifts from the thing it names is
--    exactly the bug this file exists to fix.
-- ---------------------------------------------------------------------------

alter table public.categories add column if not exists image_path      text;
alter table public.categories add column if not exists image_width     integer;
alter table public.categories add column if not exists image_height    integer;
alter table public.categories add column if not exists image_alt       text;
alter table public.categories add column if not exists show_on_home    boolean not null default false;
alter table public.categories add column if not exists home_order      integer;
alter table public.categories add column if not exists display_label   text;
alter table public.categories add column if not exists home_price_note text;

comment on column public.categories.image_path is
  'Object key in the site-images storage bucket; null means no card';
comment on column public.categories.show_on_home is
  'Include in the "Browse Our Collection" row on the home page';
comment on column public.categories.display_label is
  'What customers see. The link and the shop filter still use name, so renaming '
  'this is safe. Replaces the hardcoded getCatDisplayLabel() in productlist.astro.';
comment on column public.categories.home_price_note is
  'Replaces the amount after "From" on the card. Left null, the build uses the '
  'cheapest active in-stock product in this category - which cannot go stale.';

-- Seed display_label from the map that used to live in productlist.astro, so
-- the pill bar and the new home cards agree from the first build. Only fills
-- blanks, so a label Aru has already edited is never overwritten.
update public.categories set display_label = v.label
  from (values
    ('amigurumi',     'Soft Toys'),
    ('bouquets',      'Flower Bouquets'),
    ('flower stems',  'Flower Stems'),
    ('wall hangings', 'Home Decor'),
    ('keychains',     'Accessories')
  ) as v(key, label)
 where lower(public.categories.name) = v.key
   and public.categories.display_label is null;

-- Everything else labels itself.
update public.categories set display_label = name where display_label is null;

-- ---------------------------------------------------------------------------
-- 2. Site images: the community wall and the founder's portrait.
--
--    One table, not two. A singleton like the portrait is just a group with one
--    row in it, so it shares the table, the policy, the trigger entry and the
--    admin screen. The per-group differences (does it want captions? how many
--    photos is too many?) live in data, in the registry below, which means
--    adding a future group is one insert and no code.
-- ---------------------------------------------------------------------------

create table if not exists public.site_image_groups (
  key           text primary key,
  label         text not null,
  blurb         text,
  is_singleton  boolean not null default false,
  -- Caps build cost. Every image here is downloaded and re-encoded during each
  -- publish, so an unbounded gallery makes every price change slower.
  max_items     integer,
  wants_caption boolean not null default false,
  -- "square" | "portrait" | "free" - drives the admin preview and the warning
  -- about cropping, because .polaroid img forces a 1:1 object-fit: cover.
  aspect_hint   text not null default 'free'
);

create table if not exists public.site_images (
  id            uuid primary key default gen_random_uuid(),
  key           text not null references public.site_image_groups(key) on update cascade,
  storage_path  text not null,
  -- not null, because a picture with no description is a regression for both
  -- search engines and screen readers. The admin always writes a suggestion.
  alt           text not null default '',
  caption       text,
  width         integer,
  height        integer,
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists site_images_key_idx
  on public.site_images (key, display_order);

comment on column public.site_images.caption is
  'The words shown with the photo - the review text on the community wall. '
  'Meaningless for a portrait, so wants_caption hides the field.';

insert into public.site_image_groups (key, label, blurb, is_singleton, max_items, wants_caption, aspect_hint)
values
  ('community_wall', 'Community wall',
   'Photos from customers, shown scrolling across the home page. Each one can carry a short quote.',
   false, 12, true, 'square'),
  ('founder_portrait', 'Your photo',
   'The polaroid beside your note on the home page. It is cropped to a square, so centre yourself in the frame.',
   true, 1, false, 'square')
on conflict (key) do update
  set label = excluded.label, blurb = excluded.blurb,
      is_singleton = excluded.is_singleton, max_items = excluded.max_items,
      wants_caption = excluded.wants_caption, aspect_hint = excluded.aspect_hint;

-- Replacing a singleton means adding the new photo, not overwriting the old
-- object. Overwriting would reuse the storage key, and a replaced image would
-- then sit in the CDN under the old bytes. This retires the previous row
-- instead, which also leaves the old picture recoverable.
create or replace function public.site_images_enforce_singleton()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and exists (
    select 1 from public.site_image_groups g
     where g.key = new.key and g.is_singleton
  ) then
    update public.site_images
       set is_active = false
     where key = new.key
       and is_active
       and id <> new.id;
  end if;
  return new;
end $$;

drop trigger if exists site_images_singleton on public.site_images;
create trigger site_images_singleton
  after insert or update of is_active, key on public.site_images
  for each row execute function public.site_images_enforce_singleton();

-- ---------------------------------------------------------------------------
-- 3. Home page product picks.
--    Same shape as the show_on_home / home_order columns 09_faq_groups.sql
--    added to faqs, for the same reason: the thing being curated is already a
--    row, and a join table would buy nothing but an extra join.
-- ---------------------------------------------------------------------------

alter table public.products add column if not exists home_section text;
alter table public.products add column if not exists home_order   integer;

do $$
begin
  alter table public.products add constraint products_home_section_check
    check (home_section in ('best_sellers', 'new_arrivals'));
exception
  when duplicate_object then null;
end $$;

create index if not exists products_home_section_idx
  on public.products (home_section, home_order)
  where home_section is not null;

comment on column public.products.home_section is
  'Which home page carousel this product appears in: best_sellers (Most Loved), '
  'new_arrivals (Latest Collection), or null for neither.';

-- ---------------------------------------------------------------------------
-- 4. Product photo dimensions.
--    Needed for the same reason as site_images.width/height: the curated cards
--    render through <Image>, which cannot size a remote image by itself.
--    Nullable - backfilled by scripts/seed-site-images.mjs, written from here on
--    by the dashboard upload.
-- ---------------------------------------------------------------------------

alter table public.product_images add column if not exists width  integer;
alter table public.product_images add column if not exists height integer;

-- ---------------------------------------------------------------------------
-- 5. Storage.
--    Public, deliberately. The build fetches these objects over plain HTTPS with
--    no credentials while rendering; a private bucket would make getPublicUrl()
--    return a URL that 400s, and under <Image> that is a failed build rather
--    than a missing picture.
--    Admin write access comes from the bucket loop in 02_custom_order_submit.sql.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 15728640,
        array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 6. Anon read.
--
--    THIS BLOCK IS LOAD-BEARING. 01_admin_policies.sql enables row level
--    security on every table in its array and adds only an admin policy. Older
--    tables survive because they already had an anon select policy from before
--    that file existed; a new table does not. Without the policies below, the
--    build-time queries return zero rows and NO ERROR, site-content.ts throws
--    its "check that the table is seeded" message, and the real cause - RLS -
--    is nowhere in the error.
--
--    Verify with an unauthenticated request, not by reading this file:
--      curl "$PUBLIC_SUPABASE_URL/rest/v1/site_images?select=id&limit=1" \
--           -H "apikey: $PUBLIC_SUPABASE_KEY"
--    must return JSON, not {"code":"42501"}.
-- ---------------------------------------------------------------------------

alter table public.site_images       enable row level security;
alter table public.site_image_groups enable row level security;

drop policy if exists public_read_site_images on public.site_images;
create policy public_read_site_images on public.site_images
  for select to anon, authenticated using (is_active);

drop policy if exists public_read_site_image_groups on public.site_image_groups;
create policy public_read_site_image_groups on public.site_image_groups
  for select to anon, authenticated using (true);

commit;
