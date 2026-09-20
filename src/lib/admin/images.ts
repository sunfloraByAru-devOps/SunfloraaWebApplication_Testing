/* Photo handling.
 *
 * Supabase image transformation is NOT enabled on this project - the
 * /storage/v1/render/image/... endpoint returns FeatureNotEnabled - so
 * thumbnails cannot be produced on delivery. Everything therefore happens once,
 * here, at upload time: shrink, convert to WebP, and store a real thumbnail
 * object alongside the full image.
 *
 * Aru drops a photo off her phone; the app does the rest. She never sees a
 * path, a size, or a format. */

import { supabase } from "../supabase";
import { getImageUrl } from "../images";

export const PRODUCT_BUCKET = "product-images";

/** Longest edge, in pixels. 1600 is enough for the storefront's largest render. */
const FULL_EDGE = 1600;
const THUMB_EDGE = 400;
const QUALITY = 0.82;

/** Refuse anything absurd before we spend time decoding it. */
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export type Prepared = { full: Blob; thumb: Blob; originalBytes: number };

/* ---------- paths ----------
   One convention, everywhere:
     products/<productId>/<uuid>.webp
     products/<productId>/thumb/<uuid>.webp
   The thumbnail is found by rewriting the path, so product_images needs no
   extra column. */

export function newPhotoKey(productId: string): string {
  return `products/${productId}/${crypto.randomUUID()}.webp`;
}

export function thumbKeyFor(fullKey: string): string {
  const i = fullKey.lastIndexOf("/");
  if (i < 0) return `thumb/${fullKey}`;
  return `${fullKey.slice(0, i)}/thumb/${fullKey.slice(i + 1)}`;
}

/** Thumbnail URL where one exists, otherwise the full image. Legacy photos
 *  uploaded before this convention simply fall back. */
export function thumbUrl(storagePath: string | null | undefined): string {
  if (!storagePath) return "";
  if (!storagePath.startsWith("products/")) return getImageUrl(storagePath, PRODUCT_BUCKET);
  return getImageUrl(thumbKeyFor(storagePath), PRODUCT_BUCKET);
}

export function fullUrl(storagePath: string | null | undefined): string {
  return getImageUrl(storagePath, PRODUCT_BUCKET);
}

/* ---------- resizing ---------- */

function scaleTo(w: number, h: number, edge: number) {
  const longest = Math.max(w, h);
  if (longest <= edge) return { w, h };
  const k = edge / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

async function encode(bitmap: ImageBitmap, edge: number): Promise<Blob> {
  const { w, h } = scaleTo(bitmap.width, bitmap.height, edge);

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
  }

  // Older Safari: fall back to a detached <canvas>.
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("could not encode"))),
      "image/webp", QUALITY,
    );
  });
}

/** Decode, rotate per EXIF, shrink, and encode both sizes.
 *  Re-encoding also strips EXIF, so camera GPS data never reaches the bucket. */
export async function prepare(file: File): Promise<Prepared> {
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
      encode(bitmap, FULL_EDGE),
      encode(bitmap, THUMB_EDGE),
    ]);
    return { full, thumb, originalBytes: file.size };
  } finally {
    bitmap.close?.();
  }
}

/* ---------- upload ---------- */

export type UploadResult = { key: string; bytes: number; originalBytes: number };

/** Upload the pair. If either object fails, neither is left behind. */
export async function uploadPhoto(productId: string, file: File): Promise<UploadResult> {
  const prepared = await prepare(file);
  const key = newPhotoKey(productId);
  const thumbKey = thumbKeyFor(key);

  const up = await supabase.storage.from(PRODUCT_BUCKET)
    .upload(key, prepared.full, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (up.error) throw up.error;

  const upThumb = await supabase.storage.from(PRODUCT_BUCKET)
    .upload(thumbKey, prepared.thumb, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (upThumb.error) {
    await supabase.storage.from(PRODUCT_BUCKET).remove([key]).catch(() => {});
    throw upThumb.error;
  }

  return { key, bytes: prepared.full.size, originalBytes: prepared.originalBytes };
}

/** Remove a photo's objects. Best effort - a stray file is harmless, a row
 *  pointing at nothing is not. */
export async function removePhotoObjects(storagePath: string) {
  const keys = storagePath.startsWith("products/")
    ? [storagePath, thumbKeyFor(storagePath)]
    : [storagePath];
  await supabase.storage.from(PRODUCT_BUCKET).remove(keys).catch(() => {});
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
export function photoImg(storagePath: string, alt = "", className = ""): HTMLImageElement {
  const img = document.createElement("img");
  if (className) img.className = className;
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";

  const thumb = thumbUrl(storagePath);
  const full = fullUrl(storagePath);
  img.src = thumb || full;

  if (thumb && thumb !== full) {
    img.addEventListener("error", function onError() {
      img.removeEventListener("error", onError);
      img.src = full;
    });
  }
  return img;
}
