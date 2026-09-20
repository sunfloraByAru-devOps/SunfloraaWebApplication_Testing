# Prompt: serve product images from the build instead of Supabase Storage

Copy everything below the line into a fresh session in this repo.

---

Product photos on this Astro storefront are currently **hotlinked from Supabase Storage**.
The HTML contains absolute URLs like
`https://btmwojmtkeadxdzlfdqi.supabase.co/storage/v1/object/public/product-images/Lil_Dino_keychain_1.png`,
so every visitor's browser opens a connection to a second origin and downloads unoptimised
PNGs at full size.

Move them into the build: download at build time, run them through Astro's `<Image>`, and
serve the optimised output from Cloudflare's edge on the same origin as the page.

## Why this is worth doing

- **The LCP element on every product page is a Supabase-hosted PNG.** It costs an extra DNS
  lookup, TLS handshake and connection to an origin that is not on Cloudflare's edge.
- **Supabase image transformation is disabled on this plan** — `/storage/v1/render/image/...`
  returns `FeatureNotEnabled` — so there is no server-side resizing available. Images are
  delivered at their stored size with no WebP, no `srcset`, no responsive variants.
- **98 images, ~19 MB, all PNG.** Typical file is 150–250 KB at roughly 310×450 px.
- If Storage rate-limits or goes down, product pages render with broken images.

Astro's `<Image>` fixes all of it: WebP/AVIF, automatic `srcset`, correct intrinsic
`width`/`height` (so no layout shift), content-hashed filenames, served from `/_astro/`.

## What is already done — do not redo it

`astro.config.mjs` **already authorises** remote optimisation of Supabase public objects:

```js
image: {
  remotePatterns: [{
    protocol: 'https',
    hostname: new URL(PUBLIC_SUPABASE_URL).hostname,
    pathname: '/storage/v1/object/public/**',
  }],
}
```

It is deliberately scoped to the public object path rather than the bare host — keep that.
The file also throws a clear error if `PUBLIC_SUPABASE_URL` is missing, because the failure
would otherwise surface as "Cannot optimize remote image" and read like an image problem.

`src/pages/productdetail/[slug].astro` already imports `Image` from `astro:assets`, but
**product photos do not go through it yet** — they are still raw `<img>` tags.

## Project facts you need

- **Astro 6.3.3**, `output: static`. `sharp` 0.34.5 is present (transitive dep of Astro).
- Deployed to **Cloudflare Workers** via Workers Builds. **Pushing to `main` auto-triggers a
  build and deploy.** Content changes are published separately via a dashboard button that
  hits a Cloudflare deploy hook.
- Build today takes roughly 20–25 seconds for 23 pages.
- `src/lib/images.ts` exports `getImageUrl(path, bucket = 'product-images')`, which turns a
  `product_images.storage_path` into a public URL. This is the function every product image
  currently flows through.
- `product_images` has 98 rows; the `product-images` bucket holds 99 objects.

### Where product images are rendered

| File | What it renders |
|---|---|
| `src/pages/productlist.astro` | the shop grid (raw `<img>`) |
| `src/components/ProductGallery.astro` | the product page gallery, main image + thumb strip (raw `<img>`) |
| `src/pages/productdetail/[slug].astro` | builds the data the gallery consumes |
| `src/components/Custom.astro` | custom-order page imagery |

## The hard part — read this before you start

`src/pages/productdetail/[slug].astro` serialises **every product** into an inline
`productsJson` blob, and client-side JavaScript uses it to swap the gallery image when a
thumbnail is clicked (`setImage(index)` reassigns `img.src` from that JSON).

So it is not enough to wrap the server-rendered `<img>` in `<Image>`. **The optimised URLs
must also reach that JSON blob**, or the first paint will be an optimised image and every
thumbnail click will swap in an unoptimised cross-origin PNG. This is the single most
likely thing to get wrong.

Astro gives you the generated path from the result of `getImage()`:

```js
import { getImage } from "astro:assets";
const optimised = await getImage({ src: remoteUrl, inferSize: true, format: "webp" });
optimised.src // -> /_astro/....webp
```

Use `getImage()` in the frontmatter to build the JSON, and `<Image>` (or the same result)
for the markup, so both refer to the same generated asset.

## What to build

1. **A build-time helper**, e.g. `src/lib/product-images.ts`, that takes a
   `storage_path` and returns the optimised asset (src, width, height, srcset) — wrapping
   `getImage()` so the three call sites do not each reimplement it. Reuse `getImageUrl()`
   from `src/lib/images.ts` to resolve the path first.

2. **Wire the three render sites** to it. For remote images Astro needs dimensions: either
   pass `inferSize: true` (Astro fetches the image to read them) or supply explicit
   `width`/`height`. `inferSize` is simpler; note it costs a network fetch per image.

3. **Fix the gallery JSON** as described above.

4. **Responsive output.** The grid and the gallery want different sizes — use `widths` and
   `sizes` so a phone does not download a desktop-sized image. Prefer WebP; AVIF is smaller
   but much slower to encode and you are encoding ~98 images per build.

5. **Keep a fallback.** If a `storage_path` is missing or the fetch fails, the page must
   still render — today there is a `getFallbackImage()` for this. Do not let one bad image
   fail the whole build without a clear message saying which product and which path.

## Constraints

- **Do not change the admin dashboard's image handling.** `src/lib/admin/` renders directly
  from Storage in the browser, which is correct — it needs to show a photo the instant it is
  uploaded, with no rebuild. Only the public storefront changes.
- **Do not change how images are uploaded or stored.** The dashboard writes to Supabase
  Storage and records `storage_path`; that stays exactly as is. This task changes *rendering
  only*.
- **Do not touch `order_items.image_url`.** Those are absolute URLs captured in past orders
  and used in receipt emails. They are historical records, not site content.
- `npm run build` must still pass and every public page must render the same products, in
  the same order, with the same alt text.

## Risks to weigh and report on

- **Build time.** 98 remote fetches plus sharp encodes, on every build. Measure it. Astro
  caches optimised assets locally, but Cloudflare Workers Builds will usually start cold, so
  assume the full cost on every deploy. If it pushes the build past a few minutes, say so —
  it makes the dashboard's Publish button slower for the shop owner.
- **The build now depends on Supabase Storage being reachable.** A Storage outage turns a
  content publish into a failed build. Decide whether that is acceptable and make the failure
  message obvious if it happens.
- **Sequencing with the pending Storage migration.** There is a written, dry-run-verified
  script at `scripts/migrate-images.mjs` that reorganises the bucket into
  `products/<productId>/<uuid>.webp` and converts PNG→WebP (19 MB → ~2.6 MB). Running that
  **first** makes every build-time download roughly 8× smaller. Check with the repo owner
  whether it has been run before you measure build times.

## Definition of done

- No `supabase.co` image URLs remain in the built HTML for product pages — verify with
  `grep -o 'https://[a-z0-9]*\.supabase\.co[^"]*' dist/productlist/index.html` and the same
  for a product detail page. (Non-image Supabase references in JS bundles are expected and fine.)
- Thumbnail clicks in the gallery swap to an `/_astro/` URL, not a Supabase one.
- Every product image has intrinsic `width` and `height` attributes.
- `srcset` is present and a narrow viewport selects a smaller candidate.
- `npm run build` passes; page count stays 23; product order is unchanged.
- Build time before and after is reported explicitly.
- The shop owner's workflow is unchanged: she uploads a photo in the dashboard, presses
  Publish, and the new photo appears on the site.

## Adjacent bug, mentioned only so you do not trip over it

`getFallbackImage(id: number)` in `src/pages/productdetail/[slug].astro` branches on
`id === 1 || id === 6 || ...`, but product ids in this database are **UUIDs**, so every
comparison is false and it always returns the same fallback. The whole category-guessing
ladder is dead code. Related: `num: String(data.id).padStart(2, "0")` and
`sku: \`SFL-${data.id}\`` both assume a numeric id. Out of scope here — report it, do not
fix it as part of this task.
