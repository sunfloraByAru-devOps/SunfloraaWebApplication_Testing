/* The single source of truth for page titles, meta descriptions and social
   preview images. Before this file, every page wrote its own <Layout title=…
   description=…> literal, which is how the site ended up with four different
   brand suffixes ("Sunflora", "Sunflora Studio", "Sunflora Handmade Crochet",
   "Sunflora | Handmade Crochet") and product titles that never said the word
   "crochet" at all.

   Everything here is a pure function — no Supabase calls, no I/O — so it can
   be called from page frontmatter, from site-content.ts, and (if it's ever
   needed) from a unit test, without dragging a database client along. */

export const BRAND = "Sunflora";
export const SITE = "https://sunfloracrochet.in";
export const TITLE_LIMIT = 60;
export const DESC_LIMIT = 155;
const SUFFIX = ` | ${BRAND}`;

/* logo.JPG is square (640x640), not the 1200x630 landscape shape social
   platforms actually want — it renders, just cropped. Swap this the day a
   proper OG banner exists; nothing else needs to change when you do. */
export const DEFAULT_OG_IMAGE = "/logo.JPG";

/** Matches Layout.astro's prop names exactly, so callers can spread this
 *  straight in: <Layout {...productMeta(product)} />. */
export interface Meta {
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  robots?: string;
  ogType?: "website" | "product";
}

export function withBrand(core: string): string {
  return `${core}${SUFFIX}`;
}

/** Cuts at a word boundary rather than mid-word. No ellipsis is appended —
 *  Google adds its own in the SERP snippet, and a bare cut reads cleaner in
 *  an og:description or a share preview than a hand-added "…" would. */
export function clamp(text: string, limit: number): string {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

export function metaDescription(source: string): string {
  return clamp(source, DESC_LIMIT);
}

function singularizeWord(word: string): string {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
  if (/(s|x)es$/i.test(word)) return word.replace(/es$/i, "");
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.replace(/s$/i, "");
  return word;
}

function pluralizeWord(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, "ies");
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** True if every significant word of `phrase` already appears somewhere in
 *  `haystack`, tolerant of singular/plural mismatch on each word. This is
 *  deliberately word-level, not an exact-substring test: "Sunflower Rose
 *  Bouquet" should count as already containing "Flower Bouquet" even though
 *  the literal phrase "flower bouquet" never appears contiguously — "flower"
 *  is inside "Sunflower" and "bouquet" is present on its own. That overlap
 *  is exactly what productTitle uses to avoid "Crochet Sunflower Bouquet —
 *  Crochet Flower Bouquet | Sunflora". */
export function hasPhrase(haystack: string, phrase: string): boolean {
  const h = haystack.toLowerCase();
  return phrase
    .split(/\s+/)
    .filter(Boolean)
    .every((rawWord) => {
      const w = rawWord.toLowerCase();
      if (h.includes(w)) return true;
      const singular = singularizeWord(w);
      if (singular !== w && h.includes(singular)) return true;
      return h.includes(pluralizeWord(singular));
    });
}

export interface CategoryKeyword {
  /** The category name as stored, e.g. "Crochet Flower Bouquets". */
  plural: string;
  /** Last word singularized, e.g. "Crochet Flower Bouquet". */
  singular: string;
  /** `singular` with a leading "Crochet " stripped, e.g. "Flower Bouquet".
   *  This is what gets appended to a product title, since the product H1
   *  already guarantees the word "crochet" is present once. */
  tail: string;
}

export function categoryKeyword(categoryName: string): CategoryKeyword {
  const plural = categoryName.trim();
  const words = plural.split(/\s+/);
  const singular = words
    .map((w, i) => (i === words.length - 1 ? singularizeWord(w) : w))
    .join(" ");
  const tail = singular.replace(/^crochet\s+/i, "").trim() || singular;
  return { plural, singular, tail };
}

/** Every product H1 says "crochet" exactly once — prepended only if the
 *  product's own name doesn't already carry it (avoids "Crochet Crochet
 *  Sunflower Pot" for a product already named "Crochet Sunflower Pot"). */
export function productH1(name: string): string {
  const clean = (name || "").trim();
  return hasPhrase(clean, "crochet") ? clean : `Crochet ${clean}`;
}

export interface ProductForMeta {
  name: string;
  tagline?: string | null;
  description?: string | null;
  price?: number | null;
  categoryName?: string | null;
  image?: string;
  imageAlt?: string;
}

/** Title ladder: try "H1 — category tail", fall back to "H1 — Buy Online in
 *  India", fall back to the bare H1. Each rung is tried only if it fits
 *  TITLE_LIMIT once the brand suffix is added, and rung 1 is skipped
 *  entirely when the category tail already overlaps the name (see
 *  hasPhrase). Deliberately does NOT force the exact category phrase into
 *  every product title — that phrase belongs to the category page, which is
 *  the page that can actually rank for it. Eight products all titled "...
 *  — Crochet Flower Bouquet" would cannibalize each other and the category
 *  page instead of covering the long tail. The full category phrase still
 *  appears in the meta description below. */
export function productTitle(name: string, categoryName?: string | null): string {
  const h1 = productH1(name);
  if (categoryName) {
    const { tail } = categoryKeyword(categoryName);
    if (!hasPhrase(h1, tail)) {
      const rung1 = withBrand(`${h1} — ${tail}`);
      if (rung1.length <= TITLE_LIMIT) return rung1;
    }
  }
  const rung2 = withBrand(`${h1} — Buy Online in India`);
  if (rung2.length <= TITLE_LIMIT) return rung2;
  return withBrand(h1);
}

export function productMeta(p: ProductForMeta): Meta {
  const title = productTitle(p.name, p.categoryName);
  const { singular } = p.categoryName
    ? categoryKeyword(p.categoryName)
    : { singular: "handmade crochet piece" };
  const priceLine = p.price ? `, ₹${p.price}` : "";
  const description = clamp(
    [
      p.tagline?.trim(),
      `Handmade ${singular.toLowerCase()} from Sunflora${priceLine}.`,
      "Hand-crocheted in India, made to order in 7–10 days. Free shipping.",
    ]
      .filter(Boolean)
      .join(" "),
    DESC_LIMIT,
  );
  return {
    title,
    description: description || metaDescription(p.description || p.name),
    image: p.image,
    imageAlt: p.imageAlt,
    ogType: "product",
  };
}

export interface CategoryForMeta {
  name: string;
  label?: string | null;
  productCount: number;
  minPrice?: number | null;
  image?: string;
  imageAlt?: string;
}

export function categoryTitle(categoryName: string): string {
  return withBrand(`${categoryName} Online in India`);
}

export function categoryMeta(c: CategoryForMeta): Meta {
  const priceLine = c.minPrice ? ` from ₹${c.minPrice}` : "";
  const description = clamp(
    `${c.name} handmade to order in India. ${c.productCount} design${
      c.productCount === 1 ? "" : "s"
    }${priceLine}. Free shipping, gift-ready packing, made in 7–10 days.`,
    DESC_LIMIT,
  );
  return {
    title: categoryTitle(c.name),
    description,
    image: c.image,
    imageAlt: c.imageAlt,
  };
}

/* Category pages live at root level (/crochet-flower-bouquets/, not
   /shop/crochet-flower-bouquets/) for the stronger keyword signal. The
   trade-off: a category slug can collide with an existing route, and would
   otherwise fail silently — Astro just never generates the category page,
   and nobody notices until someone reports a 404 weeks later. This list is
   checked at build time in getShopCategories(); a collision throws instead. */
export const RESERVED_SLUGS = new Set([
  "cart",
  "checkout",
  "contact",
  "cookie-policy",
  "custom",
  "faq",
  "landing",
  "login",
  "order-confirmation",
  "privacy-policy",
  "productlist",
  "productdetail",
  "signup",
  "terms-and-conditions",
  "track-order",
  "account",
  "admin",
]);

export function pageMeta(core: string, description: string, extra?: Partial<Meta>): Meta {
  return {
    title: withBrand(core),
    description: metaDescription(description),
    ...extra,
  };
}
