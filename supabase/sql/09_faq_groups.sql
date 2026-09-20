-- Move FAQ content out of src/data/faqs.ts and into the database, so Aru can
-- edit it without a code change.
--
-- The hardcoded file holds 32 SEO-tuned questions across 6 groups, feeding the
-- FAQPage JSON-LD on /faq and a 4-question teaser on the homepage. The faqs
-- table had only question/answer/order/active, so a naive switch would have
-- replaced 32 answers with 5 and gutted the page's search value. These columns
-- carry everything the rendered page needs.
--
-- Safe to re-run.

begin;

alter table public.faqs add column if not exists group_key        text;
alter table public.faqs add column if not exists group_title      text;
alter table public.faqs add column if not exists group_blurb      text;
alter table public.faqs add column if not exists group_order      integer not null default 0;
alter table public.faqs add column if not exists show_on_home     boolean not null default false;
alter table public.faqs add column if not exists home_default_open boolean not null default false;
alter table public.faqs add column if not exists home_order       integer;

-- group_key is the /faq#<anchor> target the footer and jump-links point at.
comment on column public.faqs.group_key is 'Anchor id used by /faq#<key> links';
comment on column public.faqs.show_on_home is 'Include in the 4-question homepage teaser';

create index if not exists faqs_group_idx on public.faqs (group_order, display_order);

commit;
