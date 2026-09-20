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
import { getImageUrl } from "./images";
import { productSlug } from "./slug";

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
   is none of those things and costs the page its search ranking.

   The same now applies to every picture on the home page. The message stays
   generic because the likeliest cause is not empty content at all: a table
   with RLS enabled and no anon select policy returns zero rows and NO error,
   which is indistinguishable from having nothing in it. */
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
        `with no content. Either that content has not been added yet, or ` +
        `PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_KEY are missing for this build, ` +
        `or the table has row level security enabled with no policy letting ` +
        `anon read it — that last one returns zero rows and no error, so it ` +
        `looks exactly like empty content.`,
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

/* ── Landing page pictures ────────────────────────────────────────────────
   Everything below used to be a hardcoded array in a .astro component. The
   same fail-loud rule applies: these queries run once during `astro build`,
   and a silent empty result would ship a homepage with no category row, no
   community wall and no founder photo, which deploys perfectly and looks
   broken. assertRows() turns that into a failed build instead.

   Every loader returns real pixel dimensions. Astro's <Image> can only
   optimise a remote image when it is told the size up front; without it the
   pictures ship unoptimised and shift the layout as they load. */

const SITE_BUCKET = "site-images";
const PRODUCT_BUCKET = "product-images";

/** Indian digit grouping, matching how prices read elsewhere on the site. */
function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/* ---------- category cards ---------- */

export interface HomeCategory {
  /** The real category name. Links and the shop filter compare on this. */
  name: string;
  /** What customers read. Only ever cosmetic. */
  label: string;
  href: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  /** The amount shown after "From", e.g. "₹399". Null when nothing is priced. */
  priceFrom: string | null;
}

interface CategoryRow {
  name: string;
  display_label: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_alt: string | null;
  home_price_note: string | null;
}

/* The cards used to link to categories they did not name - "Flower Pots" went
   to Wall Hangings, "Cushions" to Keychains - because the label, the picture
   and the link were three unrelated string literals. Deriving all three from
   one row makes that mismatch unrepresentable.

   The href carries the raw `name` because that is what the shop's filter pills
   hold in data-cat; display_label is only what the card and the pill render. */
export async function getHomeCategories(): Promise<HomeCategory[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("name, display_label, image_path, image_width, image_height," +
            " image_alt, home_price_note")
    .eq("is_active", true)
    .eq("show_on_home", true)
    .not("image_path", "is", null)
    .order("home_order", { ascending: true, nullsFirst: false })
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("name");

  const rows = assertRows<CategoryRow>(
    data as CategoryRow[] | null, error, "home page categories",
  );

  /* A card promising "From ₹399" that opens an empty shelf is worse than no
     card, so the cheapest live product doubles as the proof there is one. */
  const { data: priced, error: priceErr } = await supabase
    .from("products")
    .select("base_price, categories(name)")
    .eq("is_active", true)
    .eq("in_stock", true)
    .not("category_id", "is", null);

  if (priceErr) {
    throw new Error(
      `[site-content] Failed to load category prices from Supabase: ${priceErr.message}`,
    );
  }

  const cheapest = new Map<string, number>();
  for (const row of (priced ?? []) as any[]) {
    const catName: string | undefined = row.categories?.name;
    const price = Number(row.base_price);
    if (!catName || !Number.isFinite(price) || price <= 0) continue;
    const seen = cheapest.get(catName);
    if (seen === undefined || price < seen) cheapest.set(catName, price);
  }

  const cards = rows
    .filter((row) => cheapest.has(row.name))
    .map((row) => {
      const label = row.display_label || row.name;
      const min = cheapest.get(row.name);
      return {
        name: row.name,
        label,
        href: `/productlist?category=${encodeURIComponent(row.name)}`,
        src: getImageUrl(row.image_path, SITE_BUCKET),
        // Defaults only matter for a row written by hand; every upload records
        // the real numbers. A square is the least wrong guess for these cards.
        width: row.image_width ?? 800,
        height: row.image_height ?? 800,
        alt: row.image_alt || label,
        priceFrom: row.home_price_note || (min ? rupees(min) : null),
      };
    });

  if (!cards.length) {
    throw new Error(
      `[site-content] Every home page category has a photo but no live, ` +
        `in-stock product. Refusing to build a row of cards that all open an ` +
        `empty shop — either stock one of them or turn "Show on home page" off.`,
    );
  }

  return cards;
}

/* ---------- site images ---------- */

export interface SiteImageItem {
  src: string;
  alt: string;
  caption: string | null;
  width: number;
  height: number;
}

interface SiteImageRow {
  storage_path: string;
  alt: string;
  caption: string | null;
  width: number | null;
  height: number | null;
}

async function loadSiteImages(key: string): Promise<SiteImageItem[]> {
  const { data, error } = await supabase
    .from("site_images")
    .select("storage_path, alt, caption, width, height")
    .eq("key", key)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const rows = assertRows<SiteImageRow>(
    data as SiteImageRow[] | null, error, `site images for "${key}"`,
  );

  return rows.map((row) => ({
    src: getImageUrl(row.storage_path, SITE_BUCKET),
    alt: row.alt,
    caption: row.caption,
    width: row.width ?? 800,
    height: row.height ?? 800,
  }));
}

/** Every active picture in a group, in order — the community wall. */
export async function getSiteImages(key: string): Promise<SiteImageItem[]> {
  return loadSiteImages(key);
}

/** The one active picture in a singleton group — the founder's portrait.
 *  Fails the build if it is missing, which is the point: the photo it replaced
 *  was a hot-linked URL that will expire, and silently shipping a gap is how
 *  that goes unnoticed. */
export async function getSiteImage(key: string): Promise<SiteImageItem> {
  const rows = await loadSiteImages(key);
  return rows[0];
}

/* ---------- home page product picks ---------- */

export interface HomePick {
  name: string;
  href: string;
  category: string | null;
  price: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  isNew: boolean;
  tag: string | null;
}

/* These two carousels advertised ten products that were not in this database,
   at prices nobody would honour, in cards that linked nowhere — and three of
   their images had already gone missing. They now render curated catalog rows.

   The query goes to `products` rather than the products_with_image view: the
   view is defined only in the production database, so there is no way to tell
   from this repo whether it enumerates columns and would quietly omit
   home_section. */
export async function getHomePicks(
  section: "best_sellers" | "new_arrivals",
): Promise<HomePick[]> {
  const { data, error } = await supabase
    .from("products")
    .select("name, base_price, is_new, tag," +
            " categories(name, display_label)," +
            " product_images(storage_path, alt_text, is_primary, display_order, width, height)")
    .eq("is_active", true)
    .eq("home_section", section)
    .order("home_order", { ascending: true, nullsFirst: false })
    .order("name");

  const rows = assertRows<any>(data as any[] | null, error, `home picks for "${section}"`);

  const picks = rows
    .map((row: any) => {
      const images: any[] = row.product_images ?? [];
      if (!images.length) return null;
      const primary =
        images.find((i) => i.is_primary) ??
        [...images].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0];
      if (!primary?.storage_path) return null;

      /* <Image> cannot size a remote image on its own, and a card without
         width and height reintroduces the layout shift this work exists to
         remove. Every upload records these; anything older is filled in by
         scripts/seed-site-images.mjs --backfill-dimensions. Naming the product
         makes that a one-command fix rather than a hunt. */
      if (!primary.width || !primary.height) {
        throw new Error(
          `[site-content] "${row.name}" is picked for the home page but its ` +
            `photo has no recorded dimensions. Run ` +
            `\`node scripts/seed-site-images.mjs --backfill-dimensions --yes\`, ` +
            `or re-upload the photo in the dashboard.`,
        );
      }

      const price = Number(row.base_price);
      return {
        name: row.name,
        // The same helper getStaticPaths uses, so every card is guaranteed to
        // land on a page that was actually generated.
        href: `/productdetail/${productSlug(row.name)}`,
        category: row.categories?.display_label || row.categories?.name || null,
        price: Number.isFinite(price) && price > 0 ? rupees(price) : "",
        src: getImageUrl(primary.storage_path, PRODUCT_BUCKET),
        width: primary.width,
        height: primary.height,
        alt: primary.alt_text || row.name,
        isNew: row.is_new === true,
        tag: row.tag ?? null,
      } satisfies HomePick;
    })
    .filter((p): p is HomePick => p !== null);

  /* Deliberately softer than assertRows: a curated product selling out and
     being switched off is everyday inventory work, and it must not turn the
     next publish into a failed build. Fewer than expected is fine and is
     surfaced on the dashboard instead; none at all still means the section
     would render as an empty carousel, which is a real defect. */
  if (!picks.length) {
    throw new Error(
      `[site-content] No live products with a photo are picked for ` +
        `"${section}". Choose at least one in the dashboard under Products, ` +
        `or the home page ships an empty carousel.`,
    );
  }

  return picks;
}

/* ---------- shop details ----------
   These were previously hardcoded in a dozen components, which is how the site
   ended up with four different Instagram handles and three different email
   addresses. Reading them from one table means the dashboard's "Shop details"
   screen is the single source of truth. */

export type SiteSettings = {
  emailAddress: string;
  instagramHandle: string;
  whatsappNumber: string;
  heroLine1: string;
  heroLine2: string;
  heroSubtext: string;
  shippingFee: number;
  freeShippingAbove: number;
};

/* Defaults are the values the site rendered before it read this table, so a
   missing row degrades to today's behaviour rather than a blank page. Unlike
   the FAQ loader this does not throw: a missing contact detail is a cosmetic
   problem, an empty FAQ page is an SEO one. */
const SETTING_DEFAULTS: SiteSettings = {
  emailAddress: "sunflorabyaru@gmail.com",
  instagramHandle: "sunfloraa.a",
  whatsappNumber: "910000000000",
  heroLine1: "Crochet that",
  heroLine2: "feels like home",
  heroSubtext: "Soft toys, flower bouquets & cozy keepsakes — each one stitched by hand, just for you.",
  shippingFee: 0,
  freeShippingAbove: 500,
};

let cached: SiteSettings | null = null;

export async function getSiteSettings(): Promise<SiteSettings> {
  if (cached) return cached;

  const { data, error } = await supabase.from("site_settings").select("key, value");
  if (error || !data) {
    console.warn("[site-content] Could not load shop details, using defaults:", error?.message);
    cached = SETTING_DEFAULTS;
    return cached;
  }

  const map = new Map(data.map((r: any) => [r.key, r.value]));
  const str = (k: string, d: string) => {
    const v = map.get(k);
    return v != null && String(v).trim() !== "" ? String(v).trim() : d;
  };
  const num = (k: string, d: number) => {
    const v = Number(map.get(k));
    return Number.isFinite(v) ? v : d;
  };

  cached = {
    emailAddress: str("email_address", SETTING_DEFAULTS.emailAddress),
    instagramHandle: str("instagram_handle", SETTING_DEFAULTS.instagramHandle).replace(/^@/, ""),
    whatsappNumber: str("whatsapp_number", SETTING_DEFAULTS.whatsappNumber).replace(/[^0-9]/g, ""),
    heroLine1: str("hero_headline_line1", SETTING_DEFAULTS.heroLine1),
    heroLine2: str("hero_headline_line2", SETTING_DEFAULTS.heroLine2),
    heroSubtext: str("hero_subtext", SETTING_DEFAULTS.heroSubtext),
    shippingFee: num("shipping_fee_domestic", SETTING_DEFAULTS.shippingFee),
    freeShippingAbove: num("free_shipping_above", SETTING_DEFAULTS.freeShippingAbove),
  };
  return cached;
}

/** Convenience links built from the settings above. */
export async function getContactLinks() {
  const s = await getSiteSettings();
  return {
    email: s.emailAddress,
    mailto: `mailto:${s.emailAddress}`,
    instagramHandle: s.instagramHandle,
    instagramUrl: `https://www.instagram.com/${s.instagramHandle}/`,
    whatsappNumber: s.whatsappNumber,
    whatsappUrl: `https://wa.me/${s.whatsappNumber}`,
    /* +91 98765 43210 style, for showing rather than linking. */
    phoneDisplay: formatIndianPhone(s.whatsappNumber),
  };
}

function formatIndianPhone(digits: string): string {
  const d = String(digits ?? "").replace(/[^0-9]/g, "");
  const local = d.startsWith("91") && d.length === 12 ? d.slice(2) : d;
  if (local.length !== 10) return d ? `+${d}` : "";
  return `+91-${local.slice(0, 5)}-${local.slice(5)}`;
}
