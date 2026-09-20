-- Record what happens when Aru asks for the site to be rebuilt.
--
-- 08_content_touch.sql already tells her that her edits are not live yet. It
-- could not tell her anything about fixing that, because nothing rebuilt the
-- site: every publish was a person running `wrangler deploy` by hand. The
-- dashboard now has a Publish button, and this table is what lets it say
-- "Publishing... / Published / Couldn't publish" instead of leaving her
-- guessing at a spinner.
--
-- Two decisions worth stating, because both are load-bearing:
--
--   * ONLY the publish-site edge function writes here, using the service role,
--     which bypasses RLS. There is deliberately no insert or update policy. If
--     the browser could write, an admin could fabricate a successful publish and
--     every "is my change live?" answer after that would be a lie.
--
--   * This table is deliberately NOT in the touch_content_changed trigger list
--     in 08_content_touch.sql. Adding it would mean each publish writes a row,
--     the trigger bumps content_changed_at, content_changed_at is then always
--     newer than the last build, and the "your changes aren't live" banner never
--     clears again.
--
-- Safe to re-run.

begin;

create table if not exists public.publish_runs (
  id           uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),

  -- site_settings.content_changed_at as it stood when Publish was pressed.
  -- Compared against, rather than finished_at: a build is not an atomic
  -- snapshot of the database - every page opens its own connection and queries
  -- independently - so an edit made while a build is running lands on some
  -- pages and not others. Measuring from requested_at counts that edit as
  -- unpublished, which is the honest answer.
  content_changed_at_at_request text,

  status text not null default 'queued'
    check (status in ('queued', 'building', 'success', 'failed', 'unknown', 'canceled')),

  -- Identifiers handed back by the Cloudflare deploy hook.
  build_uuid text,
  branch     text,
  worker     text,

  -- Cloudflare answers already_exists when an identical build is pending.
  already_existed boolean not null default false,

  finished_at timestamptz,
  error       text
);

create index if not exists publish_runs_recent_idx
  on public.publish_runs (requested_at desc);

create index if not exists publish_runs_active_idx
  on public.publish_runs (requested_at desc)
  where status in ('queued', 'building');

comment on table public.publish_runs is
  'One row per press of Publish. Written only by the publish-site edge function.';
comment on column public.publish_runs.status is
  'unknown means the build was started but Cloudflare stopped reporting on it - '
  'the UI shows that rather than spinning forever.';

alter table public.publish_runs enable row level security;

drop policy if exists admin_read_publish_runs on public.publish_runs;
create policy admin_read_publish_runs on public.publish_runs
  for select to authenticated using (public.is_admin());

commit;
