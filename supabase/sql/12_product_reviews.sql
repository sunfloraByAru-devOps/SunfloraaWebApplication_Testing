-- Sunflora — let customers actually leave a review, and make the helpful
-- votes count for something.
--
-- What was already right, and is deliberately NOT touched here:
--   * "Anyone reads approved reviews" on public.reviews already reads
--     (is_approved = true) OR is_admin() OR (auth.uid() = user_id) — approved
--     only for the public, with the nice touch that a signed-in customer can
--     see their own review while it waits. Nothing to fix.
--   * is_approved defaults to false, so the existing "Authenticated users
--     insert reviews" policy cannot be used to self-publish.
--   * on_review_change -> update_product_rating already recomputes
--     products.avg_rating / review_count from approved reviews only, and the
--     stored values currently match the truth for every product. Replacing it
--     would only churn the rows and trip touch_content_changed on all of them.
--
-- What is actually missing:
--   1. an email on a review, so a submission can be de-duplicated and matched
--      against a real order;
--   2. a way for someone who is not signed in to submit one at all;
--   3. a "was this helpful" vote that is recorded rather than just styled;
--   4. review_photos is world-readable even for reviews that are still
--      waiting to be approved.
--
-- Run after 01_admin_policies.sql and 03_fix_is_admin_grant.sql.
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. The email behind a review.
--    Never rendered on the storefront — it exists so the same person cannot
--    review one product twice, and so "Verified Buyer" can be decided from
--    the orders table rather than claimed by the submitter.
-- ---------------------------------------------------------------------------
alter table public.reviews add column if not exists guest_email text;

-- reviews_product_idx covers product_id alone; the storefront reads approved
-- reviews for one product, newest first.
create index if not exists reviews_product_approved_idx
  on public.reviews (product_id, is_approved, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Photos of a review that is still waiting should not be public.
--    Replaces "Anyone reads review photos", which is USING (true). The insert
--    policy and admin_manage_review_photos are left as they are.
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone reads review photos" on public.review_photos;
drop policy if exists public_read_approved_review_photos on public.review_photos;
create policy public_read_approved_review_photos on public.review_photos
  for select to public
  using (exists (
    select 1 from public.reviews r
     where r.id = review_photos.review_id
       and (r.is_approved is true or public.is_admin() or r.user_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- 3. Submitting a review without being signed in.
--
--    Same shape as submit_custom_order: anon gets EXECUTE on a function, not
--    INSERT on the table, so it can add a review and nothing else. Everything
--    arrives unapproved — Aru still decides what appears.
--
--    "Verified Buyer" is decided here, from the orders table, and is not
--    something the caller can ask for.
-- ---------------------------------------------------------------------------
create or replace function public.submit_product_review(
  p_product_id uuid,
  p_stars      int,
  p_name       text,
  p_email      text,
  p_title      text default '',
  p_body       text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_name     text := btrim(coalesce(p_name, ''));
  v_user     uuid := auth.uid();
  v_verified boolean := false;
  v_recent   int;
begin
  if p_product_id is null
     or not exists (select 1 from public.products
                     where id = p_product_id and is_active) then
    raise exception 'That product could not be found.';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Please choose a rating between 1 and 5 stars.';
  end if;

  if v_name = '' then
    raise exception 'Please tell us your name.';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Please leave an email address we can reach you on.';
  end if;

  if length(btrim(coalesce(p_body, ''))) < 10 then
    raise exception 'Please write a little more about what you thought.';
  end if;

  -- One review per person per product.
  if exists (
    select 1 from public.reviews
     where product_id = p_product_id
       and (lower(guest_email) = v_email
            or (v_user is not null and user_id = v_user))
  ) then
    raise exception 'You have already reviewed this one. Thank you!';
  end if;

  -- And a cap across products, so the form cannot be used as a firehose.
  select count(*) into v_recent
    from public.reviews
   where lower(guest_email) = v_email
     and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'That is a lot of reviews for one day. Please try again tomorrow.';
  end if;

  -- Verified Buyer: this address (or this account) actually received one.
  -- status is the order_status enum; compared as text so that adding or
  -- renaming a label elsewhere cannot turn this into a runtime error.
  select exists (
    select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where oi.product_id = p_product_id
       and o.status::text in ('shipped', 'out_for_delivery', 'delivered')
       and (lower(o.guest_email) = v_email
            or (v_user is not null and o.user_id = v_user))
  ) into v_verified;

  insert into public.reviews (
    product_id, user_id, guest_name, guest_email,
    stars, title, body, is_verified, is_approved
  ) values (
    p_product_id, v_user,
    left(v_name, 80),
    left(v_email, 200),
    p_stars,
    left(btrim(coalesce(p_title, '')), 120),
    left(btrim(p_body), 4000),
    v_verified,
    false           -- waits for the dashboard
  );
end $$;

revoke execute on function public.submit_product_review(uuid,int,text,text,text,text) from public;
grant  execute on function public.submit_product_review(uuid,int,text,text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. "Was this review helpful?"
--
--    A row per (review, browser). The key is a random id the page keeps in
--    localStorage — not an identifier of the person, and not something we
--    store anything else against. It exists so the same visitor clicking
--    twice doesn't count twice, and so a vote can be taken back.
--
--    The legacy review_votes table (user_id, review_id, is_helpful, no primary
--    key, nothing reads it) only ever worked for signed-in users and is left
--    exactly as it is.
-- ---------------------------------------------------------------------------
create table if not exists public.review_reactions (
  review_id  uuid    not null references public.reviews(id) on delete cascade,
  voter_key  text    not null,
  is_helpful boolean not null,
  created_at timestamptz not null default now(),
  primary key (review_id, voter_key)
);

alter table public.review_reactions enable row level security;
-- No policy for anon: the table is written through the function below only.
drop policy if exists admin_read_review_reactions on public.review_reactions;
create policy admin_read_review_reactions on public.review_reactions
  for select to authenticated using (public.is_admin());

create or replace function public.react_to_review(
  p_review_id uuid,
  p_voter_key text,
  p_helpful   boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key    text := btrim(coalesce(p_voter_key, ''));
  v_prev   boolean;   -- what this browser had voted, null if nothing
  v_new    boolean;   -- what it has voted after this click, null if taken back
  v_counts jsonb;
begin
  if v_key = '' or length(v_key) > 64 then
    raise exception 'That vote could not be counted.';
  end if;

  if not exists (select 1 from public.reviews
                  where id = p_review_id and is_approved is true) then
    raise exception 'That review could not be found.';
  end if;

  select rr.is_helpful into v_prev
    from public.review_reactions rr
   where rr.review_id = p_review_id and rr.voter_key = v_key;

  if v_prev is not null and v_prev = p_helpful then
    -- Clicking the same button again takes the vote back.
    v_new := null;
    delete from public.review_reactions
     where review_id = p_review_id and voter_key = v_key;
  elsif v_prev is not null then
    v_new := p_helpful;                       -- changed their mind
    update public.review_reactions
       set is_helpful = p_helpful, created_at = now()
     where review_id = p_review_id and voter_key = v_key;
  else
    v_new := p_helpful;
    insert into public.review_reactions (review_id, voter_key, is_helpful)
    values (p_review_id, v_key, p_helpful);
  end if;

  -- The counters move by the difference between this browser's old vote and
  -- its new one, rather than being recounted from scratch, so whatever was on
  -- the rows before this table existed is left alone. Switching from Yes to No
  -- has to take one off Yes as well as adding one to No, which is why both
  -- sides are computed the same way instead of case by case.
  update public.reviews r
     set helpful_count = greatest(0, coalesce(r.helpful_count, 0)
           + (case when v_new  is true then 1 else 0 end)
           - (case when v_prev is true then 1 else 0 end)),
         unhelpful_count = greatest(0, coalesce(r.unhelpful_count, 0)
           + (case when v_new  is false then 1 else 0 end)
           - (case when v_prev is false then 1 else 0 end))
   where r.id = p_review_id;

  -- jsonb rather than RETURNS TABLE: output columns named helpful_count /
  -- unhelpful_count would be in scope as variables inside this function and
  -- make every mention of those columns above ambiguous.
  select jsonb_build_object(
           'helpful_count',   coalesce(r.helpful_count, 0),
           'unhelpful_count', coalesce(r.unhelpful_count, 0)
         )
    into v_counts
    from public.reviews r
   where r.id = p_review_id;

  return v_counts;
end $$;

revoke execute on function public.react_to_review(uuid,text,boolean) from public;
grant  execute on function public.react_to_review(uuid,text,boolean) to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Note on storage: review photos live in the `review-photos` bucket, which
-- already exists, is public, and already has its read and admin policies.
-- ADMIN_DASHBOARD_PROMPT.md calls it `review-images`; that is wrong, and the
-- storefront had copied the wrong name into getPublicUrl().
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- To undo, if it ever needs undoing. Nothing here is destructive, so this is
-- only about putting the one replaced policy back:
--
--   drop policy if exists public_read_approved_review_photos on public.review_photos;
--   create policy "Anyone reads review photos" on public.review_photos
--     for select to public using (true);
--
--   drop function if exists public.submit_product_review(uuid,int,text,text,text,text);
--   drop function if exists public.react_to_review(uuid,text,boolean);
--   drop table if exists public.review_reactions;
--   drop index if exists public.reviews_product_approved_idx;
--   -- reviews.guest_email holds submitted addresses; drop it only if you mean to
--   -- lose them:  alter table public.reviews drop column guest_email;
-- ---------------------------------------------------------------------------
