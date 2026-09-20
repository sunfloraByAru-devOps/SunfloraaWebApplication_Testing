/* Photo handling.
 *
 * Supabase image transformation is NOT enabled on this project - the
 * /storage/v1/render/image/... endpoint returns FeatureNotEnabled - so
 * thumbnails cannot be produced on delivery. Everything therefore happens once,
 * here, at upload time: shrink, convert to WebP, and store a real thumbnail
 * object alongside the full image.
 *
 * Aru drops a photo off her phone; the app does the rest. She never sees a
 * path, a size, or a format.
 *
 * Two buckets now share this code. Product photos live in product-images under
 * products/<productId>/; the landing page's pictures live in site-images under
 * site/<group>/. An ImageTarget is the only difference between them, so the
 * resize, the thumbnail convention and the rollback-on-failure discipline are
 * written once. Every product-facing signature is unchanged - the extra
 * arguments are optional and default to the product target. */

import { supabase } from "../supabase";
import { getImageUrl } from "../images";

export const PRODUCT_BUCKET = "product-images";
export const SITE_BUCKET = "site-images";

/** Longest edge, in pixels. 1600 is enough for the storefront's largest render. */
const FULL_EDGE = 1600;
const THUMB_EDGE = 400;
const QUALITY = 0.82;

/** Refuse anything absurd before we spend time decoding it. */
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Where a picture lives and how big it is worth keeping.
 *
 *  fullEdge is per-target on purpose: every image the storefront renders is
 *  downloaded and re-encoded by Astro during each publish, so an oversized
 *  community photo is a cost paid on every price change, not once. */
export type ImageTarget = {
  bucket: string;
  /** First path segment, e.g. "products" or "site". */
  prefix: string;
  fullEdge?: number;
  thumbEdge?: number;
};

export const PRODUCT_TARGET: ImageTarget = {
  bucket: PRODUCT_BUCKET,
  prefix: "products",
};

/** The community wall renders at ~260px and the polaroid at ~420px, so 1600
 *  would be paying for pixels nobody sees on every build. */
export const SITE_TARGET: ImageTarget = {
  bucket: SITE_BUCKET,
  prefix: "site",
  fullEdge: 900,
};

export type Prepared = {
  full: Blob;
  thumb: Blob;
  /** Dimensions of `full` - the blob that is actually uploaded. */
  width: number;
  height: number;
  originalBytes: number;
};

/* ---------- paths ----------
   One convention, everywhere:
     <prefix>/<folder>/<uuid>.webp
     <prefix>/<folder>/thumb/<uuid>.webp
   The thumbnail is found by rewriting the path, so no table needs an extra
   column. For products the folder is the product id; for site images it is the
   group key. */

export function newKey(target: ImageTarget, folder: string): string {
  return `${target.prefix}/${folder}/${crypto.randomUUID()}.webp`;
}

export function newPhotoKey(productId: string): string {
  return newKey(PRODUCT_TARGET, productId);
}

export function thumbKeyFor(fullKey: string): string {
  const i = fullKey.lastIndexOf("/");
  if (i < 0) return `thumb/${fullKey}`;
  return `${fullKey.slice(0, i)}/thumb/${fullKey.slice(i + 1)}`;
}

/** Thumbnail URL where one exists, otherwise the full image.
 *
 *  The guard asks "does this path follow the folder convention" - a flat key
 *  has no thumbnail to rewrite to. Legacy photos uploaded before the convention
 *  simply fall back. */
export function thumbUrl(
  storagePath: string | null | undefined,
  bucket = PRODUCT_BUCKET,
): string {
  if (!storagePath) return "";
  if (!storagePath.includes("/")) return getImageUrl(storagePath, bucket);
  return getImageUrl(thumbKeyFor(storagePath), bucket);
}

export function fullUrl(
  storagePath: string | null | undefined,
  bucket = PRODUCT_BUCKET,
): string {
  return getImageUrl(storagePath, bucket);
}

/* ---------- resizing ---------- */

function scaleTo(w: number, h: number, edge: number) {
  const longest = Math.max(w, h);
  if (longest <= edge) return { w, h };
  const k = edge / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

type Encoded = { blob: Blob; width: number; height: number };

async function encode(bitmap: ImageBitmap, edge: number): Promise<Encoded> {
  const { w, h } = scaleTo(bitmap.width, bitmap.height, edge);

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
    return { blob, width: w, height: h };
  }

  // Older Safari: fall back to a detached <canvas>.
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("could not encode"))),
      "image/webp", QUALITY,
    );
  });
  return { blob, width: w, height: h };
}

/** Decode, rotate per EXIF, shrink, and encode both sizes.
 *  Re-encoding also strips EXIF, so camera GPS data never reaches the bucket.
 *
 *  The dimensions returned are measured from the encoded result, not the source
 *  file. The fallback createImageBitmap() call below cannot apply EXIF
 *  rotation, so a phone photo's stored width and height can be the transpose of
 *  what actually renders - and these numbers go straight into <Image>, which
 *  would then size the picture wrongly on every page. */
export async function prepare(file: File, target: ImageTarget = PRODUCT_TARGET): Promise<Prepared> {
  if (!file.type.startsWith("image/")) throw new Error("not-an-image");
  if (file.size > MAX_INPUT_BYTES) throw new Error("too-large");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some browsers reject the options bag rather than ignoring it.
    bitmap = await createImageBitmap(file);
  }

  try {
    const [full, thumb] = await Promise.all([
      encode(bitmap, target.fullEdge ?? FULL_EDGE),
      encode(bitmap, target.thumbEdge ?? THUMB_EDGE),
    ]);
    return {
      full: full.blob,
      thumb: thumb.blob,
      width: full.width,
      height: full.height,
      originalBytes: file.size,
    };
  } finally {
    bitmap.close?.();
  }
}

/* ---------- upload ---------- */

export type UploadResult = {
  key: string;
  bytes: number;
  width: number;
  height: number;
  originalBytes: number;
};

/* A UUID key names one immutable object, so it can be cached forever. The old
   one-hour value made Astro re-download every image on every publish for no
   benefit. Nothing may ever upload with upsert: true - replacing the bytes
   under a cached key is the one case where a long TTL would bite. */
const CACHE_CONTROL = "31536000";

/** Upload the pair. If either object fails, neither is left behind. */
export async function uploadImage(
  target: ImageTarget,
  folder: string,
  file: File,
): Promise<UploadResult> {
  const prepared = await prepare(file, target);
  const key = newKey(target, folder);
  const thumbKey = thumbKeyFor(key);

  /* Older Safari silently writes a PNG when asked for WebP. Labelling it
     image/webp anyway would put a lie in the object's content-type; browsers
     and sharp both sniff and cope, but the header is what a CDN and Astro go
     by, so record what we actually produced. */
  const fullType = prepared.full.type || "image/webp";
  const thumbType = prepared.thumb.type || "image/webp";

  const up = await supabase.storage.from(target.bucket)
    .upload(key, prepared.full, { contentType: fullType, cacheControl: CACHE_CONTROL, upsert: false });
  if (up.error) throw up.error;

  const upThumb = await supabase.storage.from(target.bucket)
    .upload(thumbKey, prepared.thumb, { contentType: thumbType, cacheControl: CACHE_CONTROL, upsert: false });
  if (upThumb.error) {
    await supabase.storage.from(target.bucket).remove([key]).catch(() => {});
    throw upThumb.error;
  }

  return {
    key,
    bytes: prepared.full.size,
    width: prepared.width,
    height: prepared.height,
    originalBytes: prepared.originalBytes,
  };
}

export async function uploadPhoto(productId: string, file: File): Promise<UploadResult> {
  return uploadImage(PRODUCT_TARGET, productId, file);
}

/** Remove a photo's objects. Best effort - a stray file is harmless, a row
 *  pointing at nothing is not. */
export async function removePhotoObjects(storagePath: string, bucket = PRODUCT_BUCKET) {
  const keys = storagePath.includes("/")
    ? [storagePath, thumbKeyFor(storagePath)]
    : [storagePath];
  await supabase.storage.from(bucket).remove(keys).catch(() => {});
}

/** A sensible starting description, so no photo ships without alt text. */
export function suggestAltText(productName: string, index: number): string {
  const base = (productName || "Handmade crochet piece").trim();
  return index === 0 ? base : `${base} — photo ${index + 1}`;
}

export function prettyBytes(n: number): string {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** An <img> that prefers the small version but silently falls back to the full
 *  one if no thumbnail exists.
 *
 *  Legacy photos predate the thumb/ convention, and the migration may skip
 *  thumbnails for images that are already tiny, so a missing thumbnail is a
 *  normal condition rather than an error. Browsers do not retry a 404 on their
 *  own, hence the explicit handler. */
export function photoImg(
  storagePath: string,
  alt = "",
  className = "",
  bucket = PRODUCT_BUCKET,
): HTMLImageElement {
  const img = document.createElement("img");
  if (className) img.className = className;
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";

  const thumb = thumbUrl(storagePath, bucket);
  const full = fullUrl(storagePath, bucket);
  img.src = thumb || full;

  if (thumb && thumb !== full) {
    img.addEventListener("error", function onError() {
      img.removeEventListener("error", onError);
      img.src = full;
    });
  }
  return img;
}
