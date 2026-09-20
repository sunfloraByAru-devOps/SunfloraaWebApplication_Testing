# Prompt: build the Sunflora admin dashboard

Copy everything below the line into a fresh session in this repo.

---

Build a custom admin dashboard at `/admin` for the Sunflora storefront, designed for a
**non-technical shop owner (Aru)** to run the site without ever touching Supabase,
Directus, or anything that looks like a database.

## Who this is for

Aru owns a handmade crochet business. She is not technical. She should never see a UUID,
a column name, a JSON blob, or the words "collection", "record", "schema", or "null".
Every screen should read like the shop, not like the database: "Products", "Photos",
"Price", "In stock", "Show on site".

If a screen would make her ask "what does that mean?", it is wrong.

## Project context

- **Astro 6.3.1**, `output: static` (see `astro.config.mjs` — there is no SSR adapter).
- **Tailwind CSS 4** via `@tailwindcss/vite`.
- **Supabase** Postgres + Storage. Client is already configured and exported from
  `src/lib/supabase.ts` (uses `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_KEY` — note the
  `PUBLIC_` prefix is required because it's imported from browser `<script>` tags).
- Deployed to **Cloudflare Workers** via Wrangler, serving `./dist` as static assets.
- Live site: `sunfloracrochet.in`.

**Reuse, do not reinvent:**
- `src/lib/supabase.ts` — the configured Supabase client.
- `src/lib/images.ts` — `getImageUrl(path, bucket = 'product-images')` resolves a
  storage path to a public URL. The storefront renders images through this.
- `src/lib/slug.ts` — `productSlug(name)`, used to build product detail URLs.
- `src/lib/auth.ts` — `sendMagicLink()`, `getCurrentUser()`, `logout()`. Auth is
  **magic-link** (`signInWithOtp`), so there is no password for Aru to lose. Keep it.
- `src/middleware.ts` — already contains an `/admin` stub with the comment
  `check session + profile.role === 'admin'`. Finish that idea.
- `src/layouts/Layout.astro` — base layout.

## STEP 0 — Audit RLS first. This is blocking.

The site is statically rendered and the browser holds the **anon** key, so the admin
cannot rely on server-side checks: **Row Level Security is the only real security
boundary.** Before writing any UI:

1. Inspect existing RLS policies on `products`, `product_images`, `product_sizes`,
   `product_colors`, `product_details`, `product_includes`, `categories`, `reviews`,
   and the `product-images` storage bucket — and, for Part B, on `orders`,
   `order_items`, `order_status_history`, `addresses`, `custom_orders`,
   `custom_order_status_history`, `contact_messages`, `newsletter_subscribers`,
   `profiles`, and the `custom-order-uploads` bucket. The Part B tables hold customer
   personal data: if any of them are readable by `anon` today, that is a live data leak
   and you should report it immediately, before doing anything else.
2. Report what you find before changing anything. If writes are currently open to
   `anon`, say so plainly — that is a pre-existing vulnerability, not something this
   task introduced.
3. Write policies so that **write access requires `profiles.role = 'admin'`** for the
   authenticated user, and `anon` keeps read-only access to active products (the
   storefront depends on anonymous reads — do not break it).
4. Verify by attempting a write with an anon client and confirming it is rejected.

Do not skip this and do not build the UI first. A pretty admin over open RLS is worse
than no admin.

## Scope

The dashboard has **two distinct parts**, reachable from one nav. Aru is the business
owner, so she gets access to all of it. Build **Part A first** and get it working before
starting Part B — they are separable, and Part A is what unblocks her day-to-day.

- **Part A — Catalog**: the things she publishes (products, photos, categories, reviews)
- **Part B — Shop**: the things customers generate (orders, custom orders, enquiries)

A **Home / Today** screen is the landing page: new orders awaiting action, pending
custom-order requests, unread messages, reviews awaiting approval, and anything out of
stock. She should be able to open the dashboard and immediately see what needs her.

---

### Login

Magic link via the existing `sendMagicLink()`. After sign-in, check
`profiles.role === 'admin'`; if not admin, sign out and show a plain "not authorised"
message. Do not expose why.

---

### PART A — Catalog

1. **Products list** — card or table view showing photo, name, category, price, and
   in-stock / visible toggles. Search by name. Inline toggles for **In stock** and
   **Show on site** (`in_stock`, `is_active`) that save immediately with a clear saved
   indicator. A prominent "Add product" button.

2. **Product editor** — one page, one form, grouped in plain language:
   - *Basics*: name, tagline, description, category (dropdown from `categories`, never
     a raw id), price, "was" price.
   - *Photos*: drag-to-upload, thumbnail grid, drag to reorder, click to set the main
     photo, click to delete. This is the single most important screen — see the Photos
     section below.
   - *Options* (collapsed by default, most products won't need them): sizes, colours,
     details, what's included.
   - *Visibility*: in stock, show on site, mark as new, badge text.
   Save with clear success/failure feedback. Never show `id`, `search_vector`,
   `created_at`, `updated_at`, `avg_rating`, or `review_count` as editable fields —
   ratings and review counts are computed, and `search_vector` is internal Postgres.

3. **Reviews** — list pending reviews with star rating, title, body and photos.
   Approve / unapprove (`is_approved`) and delete. Nothing else is editable.

4. **Categories** — simple list: name, visible toggle, reorder.

5. **Site content** — `faqs`, `testimonials`, `gallery_items`, `site_settings`. Simple
   list + form each. Low priority; do these last within Part A.

---

### PART B — Shop (orders, customers, enquiries)

This is real business data. It is **not** out of scope — Aru runs the shop and needs it.
But it has different rules from Part A: most of it is a **record of what happened**, so
default to read-only, and allow editing only where she genuinely acts on something
(fulfilling an order, answering a request).

6. **Orders** — list with order number, customer name, date, total, and status, newest
   first. Filter by status, search by customer or order number. Opening an order shows:
   items (`order_items`) with product, quantity and price; the delivery address; contact
   details; totals; and the status history (`order_status_history`).
   - She **can**: change the order status (this is her main action — moving an order
     through e.g. paid → made → shipped → delivered), add a tracking reference, and
     write an internal note.
   - She **cannot**: edit prices, line items or totals of a placed order. That is a
     financial record. If something is wrong she cancels and re-creates.
   - Every status change should append to `order_status_history`, not overwrite.

7. **Custom orders** — the bespoke-request queue (`custom_orders`, with
   `custom_order_status_history`). Each request has the customer's description, size,
   contact details and an uploaded inspiration image (in the `custom-order-uploads`
   bucket — render it, don't show a path). She needs to read them, move them through a
   status, and note a quoted price. This is a workflow queue, so make the "what needs a
   reply" state obvious.

8. **Customers** — read-only view built from `profiles` and `addresses`: name, contact,
   and their order history. No editing. This exists so she can look someone up when they
   email her, nothing more.

9. **Messages & newsletter** — `contact_messages` as a simple inbox (read, mark handled);
   `newsletter_subscribers` as a list with an export-to-CSV button.

**Handle this data carefully.** It is real customer personal information:
- Never log it to the console or to any third party.
- Do not build bulk-delete for orders or customers. Deletion of financial records should
  not be a button someone can hit by accident.
- Phone numbers, emails and addresses appear only on the screens that need them — not in
  list views where they'd be on screen unnecessarily.
- The same RLS rule applies: only `profiles.role = 'admin'` may read any of it. Getting
  this wrong here leaks customer data publicly, so it matters more than anywhere else.

**Genuinely out of scope**: `wishlists`, `review_votes`, `product_related` — these have
no primary key and nothing reads them. Leave them alone.

## Photos — get this right

The storefront reads `product_images.storage_path` (a **text** column, `NOT NULL`) and
resolves it with `getImageUrl()` against the public `product-images` bucket. So the
upload flow must be:

1. Upload the file to the `product-images` bucket via Supabase Storage.
2. Insert a `product_images` row whose `storage_path` is the object key you just
   uploaded, with `product_id`, `display_order`, and `is_primary`.
3. Confirm it renders via `getImageUrl(storage_path)`.

Aru must never see, type, or copy a storage path. She drops a photo; the app does the
rest. Reordering writes `display_order`; "set as main" writes `is_primary` (and clears
it on the others).

> A Directus CMS was trialled and removed in Sept 2026. `product_images` is back to its
> original seven columns — `storage_path` is the only image reference, and writing it
> directly is correct. If you find any `directus_*` table still present, it is dead
> weight from that trial and nothing reads it.

## Schema reference

Verify this against the live database before relying on it; it is a starting map, not
gospel.

- **products** — `id` (uuid, PK), `sku`, `name`, `tagline`, `description`,
  `category_id` (uuid → categories), `brand`, `base_price`, `base_mrp`, `tag`,
  `is_new`, `in_stock`, `display_order`, `is_active`, `avg_rating`, `review_count`,
  `search_vector` (internal), `created_at`, `updated_at`
- **product_images** — `id` (uuid, PK), `product_id`, `storage_path` (text, NOT NULL),
  `alt_text`, `display_order`, `is_primary`, `created_at`
- **product_sizes** — `label`, `cm_description`, `price`, `mrp`, `display_order`
- **product_colors** — `name`, `hex`, `has_border`, `display_order`
- **product_details** — `label`, `value`, `display_order`
- **product_includes** — `item`, `display_order`
- **customer_insights** — `label`, `display_order`; **customer_insight_options** —
  `text`, `pct`, `display_order`
- **reviews** — `id`, `stars`, `title`, `body`, `guest_name`, `user_id` → profiles,
  `is_verified`, `is_approved`, `helpful_count`, `unhelpful_count`, `created_at`;
  **review_photos** — `storage_path`
- **categories** — `id`, `name`, `slug`, `description`, `is_active`, `display_order`
- **profiles** — `id`, `role`, `full_name`, `phone`, `avatar_url`, timestamps
- **products_with_image** — a convenience *view* the storefront reads
  (`primary_image_path`, `category_name`, …). Read-only; write to the base tables.
- Storage buckets: `product-images`, `review-images`, `custom-order-uploads`.
- **orders / order_items / order_status_history**, **addresses**,
  **custom_orders / custom_order_status_history**, **contact_messages**,
  **newsletter_subscribers** — Part B tables. Inspect these yourself before building;
  I have not enumerated their columns here, so do not assume field names.
- `product_related`, `wishlists`, `review_votes` have **no primary key**. Ignore them.

## Hard constraints

- **Do not break the storefront.** Do not alter existing pages, existing queries, or
  the shape of any table the site reads. `npm run build` must still pass and the public
  pages must render exactly as before.
- **Static output.** Build `/admin` as a client-rendered island (or a small client-side
  app under one route). Do not add an SSR adapter or change `output` unless you have a
  concrete reason, and say so first if you do.
- **RLS is the security boundary** — see Step 0.
- Handle the offline/error cases: failed upload, failed save, expired session. Aru
  should get a plain-English message, never a raw Supabase error object.

## Design

Match the storefront's existing look (tokens are documented in `agents.md`):

- Cream background `#FFF8F0`, alt section `#FDF2E9`, card `#FFFFFF`
- Primary rose `#8B4557`, accent pink `#D4708F`, gold `#C8862C`
- Headings brown `#5C3D2E`, body `#6B5B4E`, soft border `#E8D5C4`
- Headings in **Playfair Display**, body in **Inter**
- Warm, rounded, generous whitespace — it should feel like the shop

Must work on a phone; she will use it on her phone.

## Definition of done

- RLS audited, fixed, and verified with an anon-client write attempt that fails.
- A non-admin user cannot reach `/admin` or write any data.
- Aru can, without help: add a product with photos, change a price, toggle stock,
  reorder photos, set a main photo, and approve a review.
- Aru can, without help: find an order, see what was bought and where it ships, move it
  through its statuses, and work the custom-order queue.
- Placed orders cannot have their line items or totals edited, and there is no
  bulk-delete for orders or customers.
- Customer personal data (emails, phones, addresses) is readable only by an admin —
  verified with an anon client — and never appears in logs.
- No UUIDs, column names, or raw errors visible anywhere in the UI.
- `npm run build` passes and the public site is byte-for-byte unaffected in behaviour.
- Report anything you chose not to build and why.

Start with Step 0 and report the RLS findings before building anything.
