import { getImage } from "astro:assets";
import { getImageUrl } from "./images";

/* Matches the `site` literal repeated across src/pages/*.astro (astro.config.mjs
   also sets it, but that value isn't available to a plain module at build time). */
const SITE = "https://sunfloracrochet.in";

/* Image `src` stays site-relative, so it resolves correctly under `astro dev`
   and in a local `dist` preview as well as in production. Call this only where
   a URL leaves the page and has to stand on its own: schema.org Product.image
   (Google requires absolute) and the cart's image_url, which is copied into
   order_items.image_url and rendered in receipt emails. Applying it at those
   two points rather than at the source keeps fallback images — which never go
   through getImage() — absolute there too. */
export function toAbsoluteUrl(src: string): string {
  if (!src) return "";
  return new URL(src, SITE).toString();
}

export interface OptimizedProductImage {
  src: string;
  width: number;
  height: number;
  srcset: string;
}

/* getStaticPaths runs the whole [slug].astro frontmatter once per product page
   (23 of them), and that frontmatter maps every product's images into the
   productsJson blob every time. Without this cache, that's 98 images x 23
   pages of redundant remote size-probing. A single in-memory cache keyed by
   URL+widths survives for the lifetime of one `astro build` process, so each
   distinct image is only ever fetched and encoded once no matter how many
   pages reference it. */
const cache = new Map<string, Promise<OptimizedProductImage | null>>();

async function optimize(
  storagePath: string | null | undefined,
  bucket: string,
  widths: number[],
): Promise<OptimizedProductImage | null> {
  const remoteUrl = getImageUrl(storagePath, bucket);
  if (!remoteUrl) return null;

  const key = `${remoteUrl}|${widths.join(",")}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const result = await getImage({
          src: remoteUrl,
          inferSize: true,
          format: "webp",
          widths,
        });
        return {
          src: result.src,
          width: Number(result.attributes.width) || 0,
          height: Number(result.attributes.height) || 0,
          srcset: result.srcSet.attribute,
        };
      } catch (err) {
        console.error(
          `[product-images] could not optimize storage path "${storagePath}" ` +
            `(${remoteUrl}): ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    })();
    cache.set(key, pending);
  }
  return pending;
}

/* Covers both the gallery's main image (rendered up to ~700px) and its own
   thumbnail strip (rendered around 80px) — the same photo backs both, so one
   optimized asset with a wide `widths` spread serves both via `sizes`. */
const GALLERY_WIDTHS = [100, 250, 450, 700];

/* Product grid cards and the recommendations strip render at a fixed ~300px
   box; 450 covers a 1.5x-density screen without requesting anything close to
   the ~310-450px native size these photos are stored at today. */
const GRID_WIDTHS = [200, 300, 450];

export function getGalleryImage(
  storagePath: string | null | undefined,
  bucket = "product-images",
): Promise<OptimizedProductImage | null> {
  return optimize(storagePath, bucket, GALLERY_WIDTHS);
}

export function getGridImage(
  storagePath: string | null | undefined,
  bucket = "product-images",
): Promise<OptimizedProductImage | null> {
  return optimize(storagePath, bucket, GRID_WIDTHS);
}
