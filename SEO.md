# SEO — how titles, headings and category pages work

Read this before adding a product or a category. Everything below is
automatic — the only two places you write anything are the product Name
field and the category Description field.

## The short version

- **Products**: fill in the form (name, tagline, description, category,
  price, photos). The URL, title tag, heading, meta description, social
  preview image, Product schema and the "you might also like" strip are all
  generated from that. No SEO step.
- **Categories**: name it the way a customer would search
  (`Crochet Flower Bouquets`, not `Bouquets`), add a photo, and write the
  **Description** field (Categories → your category → "Shop page
  description") — 400–700 words, first paragraph as the lead. That's the one
  thing nothing can write for you.

## Why "crochet" isn't in most category names by default

Buyer searches in India (from Google autocomplete, `gl=in`) look like:
`crochet flower bouquet`, `crochet soft toys`, `crochet keychain under 100`,
`handmade crochet gift for boyfriend`. The category naming convention is
**`Crochet <Thing>s`** — plural, "Crochet" first — for exactly that reason:
`Crochet Soft Toys`, `Crochet Flower Bouquets`, `Crochet Keychains`,
`Crochet Flower Stems`.

**Never target**: `crochet soft toys tutorial`, `...patterns`,
`...for beginners`, `...free patterns`. Those searches are people who want to
*make* one, not buy one — a craft-hobbyist audience, not a customer. Ranking
for them brings the wrong traffic.

## Where the keyword actually lives

The exact category phrase ("crochet flower bouquets") belongs to the
**category page**, not to every product in it. Eight products all titled
`... — Crochet Flower Bouquet` would just compete with each other and with
the category page for the same search. So:

- **Category page** (`/crochet-flower-bouquets/`) owns the head term. Title:
  `<Category> Online in India | Sunflora`. H1: `Handmade <Category> in India`.
- **Product page** owns the long tail — the specific thing someone searches
  for once they already know what category they want. Title ladder (see
  `src/lib/seo.ts`, `productTitle()`):
  1. `Crochet <Name> — <category tail> | Sunflora` — e.g.
     `Crochet Sunshine Amigurumi — Soft Toy | Sunflora`
  2. If the name already contains the category word (`Crochet Sunflower Pot`
     already says "sunflower"/"pot"), or rung 1 would run past 60 characters:
     `Crochet <Name> — Buy Online in India | Sunflora`
  3. If that's still too long: just `Crochet <Name> | Sunflora`.

  The full category phrase still appears in the product's **meta
  description** and its **breadcrumb** — it isn't missing, it's just not
  fighting the category page for the same title.

## One brand suffix

Every title ends `| Sunflora`. Not "Sunflora Studio", not "Sunflora Handmade
Crochet" — those existed as four different variants across the site before
this file existed, which is exactly the kind of drift `src/lib/seo.ts` is
meant to prevent. If you're writing a title by hand, wrap it with
`pageMeta()` or `withBrand()` from that file rather than typing the suffix.

## Adding a product

1. **Name**: what it is, written the way a customer would search — not a pet
   name. `Sunny` makes a weak title; `Sunny Sunflower Keychain` makes a good
   one. This becomes the H1, the title tag, and the URL slug.
2. **Short tagline**: one benefit sentence. It's the first line of the
   Google snippet.
3. **Description**: falls back into the meta description if the tagline is
   empty. Doesn't need to be keyword-stuffed — the category and "crochet"
   are already handled by the template.
4. **Category**: picks which category page this product shows up on, and
   which keyword tail its title uses.
5. Photos, price, publish.

**Known gap**: renaming a product changes its URL slug with no redirect.
Cheap now (the site isn't indexed yet); once it is, a rename costs real
traffic. Prefer adding a new product over renaming an existing one once the
site is live in search.

## Adding a category

1. **Name**: `Crochet <Thing>s` — the convention above.
2. **Shown as**: optional shorter label, for when the full name would wrap
   awkwardly in the filter pill.
3. **Photo**: required for the category to show as a home page card.
4. **Description**: the shop page intro. 400–700 words, first paragraph as
   the lead (it renders directly under the H1, above the product grid — the
   rest goes in an "About" section below the grid). A blank category
   description isn't a hard failure — the page renders with a short generic
   fallback line instead — but it reads thin and isn't really finished.

The page, its H1, its title, its schema (`CollectionPage` + `ItemList` +
`BreadcrumbList`) and its filter pill all generate automatically once the
category has at least one product. **A category with zero products gets no
pill and no page at all** — this replaced two filter buttons ("Home Decor",
"Customs") that always showed "Nothing here yet"; it self-corrects the
moment a product is assigned.

### What renaming a category actually ripples into

Renaming is safe and mechanical, but everything below changes together —
worth knowing before you do it, not after:

- The category page's URL changes (`/bouquets/` → `/crochet-flower-bouquets/`
  or whatever the new name slugifies to). **No redirect exists for this.**
  Free now, costs traffic once the site is indexed by Google.
- Every product in that category gets a new title and meta description,
  since both are derived from the category name.
- The filter pill, the home page card link, and the `?category=` legacy
  link all update together — they all derive from the same `name`.
- If the new name slugifies to something that collides with an existing
  page (or another category), **the build fails on purpose** rather than
  silently producing a 404 — see "Reserved names" below. Fix the collision
  and rebuild.

### Reserved names

Category pages live at the site root (`/crochet-flower-bouquets/`, not
`/shop/crochet-flower-bouquets/`) for a slightly stronger search signal. The
cost: a category slug can collide with an existing page. `cart`, `checkout`,
`contact`, `cookie-policy`, `custom`, `faq`, `landing`, `login`,
`order-confirmation`, `privacy-policy`, `productlist`, `productdetail`,
`signup`, `terms-and-conditions`, `track-order`, `account`, `admin` are all
reserved — a category that slugifies to one of these fails the build with a
clear error (`getShopCategories()` in `src/lib/site-content.ts`) instead of
quietly never appearing. If you hit this, rename the category slightly.

## The site is static — remember to publish

Nothing above goes live until the site is rebuilt and deployed. Saving a
product or category rename in the dashboard does not update the live pages
by itself — see `PUBLISHING.md` for the Publish button and what it does.

## Not automatic, still worth doing eventually

- **Google Search Console**: after any batch of title/URL changes, resubmit
  the sitemap and use URL Inspection → Request Indexing on anything that
  moved. See the earlier audit notes for the credential setup.
- **`/seo drift compare`**: run this after publishing to confirm exactly
  what changed against the stored baseline, and nothing unintended.
