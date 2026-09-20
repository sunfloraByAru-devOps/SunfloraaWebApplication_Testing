/* Build-time content loaders.

   FAQ content used to live in src/data/faqs.ts as a hardcoded array. It now
   lives in public.faqs so it can be edited without a code change. These
   loaders run in Astro component frontmatter, which executes at build time
   under `output: "static"` — the queries happen once during `astro build` and
   the answers are baked into the generated HTML. Nothing here reaches the
   browser.

   The page set is deliberately deep: informational questions ("what is
   amigurumi", "do crochet flowers last forever") capture top-of-funnel search
   traffic, and each answer is written to stand alone as a search result. */

import { supabase } from "./supabase";

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqGroup {
  /** Anchor id — footer links point at /faq#<id> */
  id: string;
  title: string;
  /** Short lead-in shown under the group title on /faq. Adds crawlable context. */
  blurb?: string;
  items: FaqItem[];
}

export interface HomeFaqItem extends FaqItem {
  defaultOpen?: boolean;
}

interface FaqRow {
  question: string;
  answer: string;
  group_key: string;
  group_title: string;
  group_blurb: string | null;
  home_default_open: boolean | null;
}

/* FAIL LOUDLY, NEVER SILENTLY.
   A query error or an empty result must throw, not degrade to an empty list.
   This code runs at build time: swallowing the failure would ship a /faq page
   and a homepage teaser with zero questions, silently gutting ~30 indexed
   answers and the FAQPage structured data along with them. A broken build is
   loud, obvious and cheap to fix; a blank FAQ page that deploys successfully
   is none of those things and costs the page its search ranking. */
function assertRows<T>(
  rows: T[] | null,
  error: { message: string } | null,
  what: string,
): T[] {
  if (error) {
    throw new Error(
      `[site-content] Failed to load ${what} from Supabase: ${error.message}`,
    );
  }
  if (!rows || rows.length === 0) {
    throw new Error(
      `[site-content] Loaded 0 rows for ${what}. Refusing to build a page ` +
        `with no content — check that public.faqs is seeded and that ` +
        `PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_KEY are set for this build.`,
    );
  }
  return rows;
}

/** All active FAQs, folded into ordered groups — the shape /faq renders. */
export async function getFaqGroups(): Promise<FaqGroup[]> {
  const { data, error } = await supabase
    .from("faqs")
    .select("question, answer, group_key, group_title, group_blurb")
    .eq("is_active", true)
    .order("group_order", { ascending: true })
    .order("display_order", { ascending: true });

  const rows = assertRows<FaqRow>(data as FaqRow[] | null, error, "FAQ groups");

  // Rows arrive pre-sorted by group_order then display_order, so first-seen
  // order is group order and push order is item order.
  const byKey = new Map<string, FaqGroup>();
  for (const row of rows) {
    let group = byKey.get(row.group_key);
    if (!group) {
      group = {
        id: row.group_key,
        title: row.group_title,
        blurb: row.group_blurb ?? undefined,
        items: [],
      };
      byKey.set(row.group_key, group);
    }
    // The blurb is repeated on every row of a group; take the first non-empty
    // one so a blank leading row can't wipe it out.
    if (group.blurb === undefined && row.group_blurb) {
      group.blurb = row.group_blurb;
    }
    group.items.push({ q: row.question, a: row.answer });
  }

  return [...byKey.values()];
}

/* ── Homepage teaser ──────────────────────────────────────────────────────
   Four questions only, chosen because each one removes a reason not to buy:
   the wait, the cost, the risk, and "you don't have what I want". The two
   marked open are the risk-reversal pair — free shipping and returns — so
   the reassurance is visible without anyone having to click. Which four, and
   which two open, is now decided by show_on_home / home_default_open. */
export async function getHomeFaqs(): Promise<HomeFaqItem[]> {
  const { data, error } = await supabase
    .from("faqs")
    .select("question, answer, home_default_open")
    .eq("show_on_home", true)
    // Also filter on is_active: without it, hiding a question in the dashboard
    // would remove it from /faq while leaving it on the homepage, which is a
    // worse failure than the teaser briefly showing fewer than four.
    .eq("is_active", true)
    .order("home_order", { ascending: true });

  const rows = assertRows<Pick<FaqRow, "question" | "answer" | "home_default_open">>(
    data as Pick<FaqRow, "question" | "answer" | "home_default_open">[] | null,
    error,
    "homepage FAQs",
  );

  return rows.map((row) => ({
    q: row.question,
    a: row.answer,
    defaultOpen: row.home_default_open === true,
  }));
}
