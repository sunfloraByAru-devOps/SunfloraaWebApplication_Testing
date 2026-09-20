#!/usr/bin/env node
/**
 * migrate-images.mjs — reorganise `product-images` storage into one convention.
 *
 *   product-images/products/<productId>/<uuid>.webp         full image, longest edge <= 1600px
 *   product-images/products/<productId>/thumb/<uuid>.webp   400px thumbnail
 *
 * Thumbnails are located BY PATH CONVENTION (insert `thumb/` before the filename),
 * so no database schema change is required. `product_images.storage_path` keeps
 * pointing at the full image.
 *
 * Stages (pick exactly one):
 *   --dry-run    (default) print the full plan. Touches nothing.
 *   --migrate    download -> re-encode -> upload both sizes -> update storage_path.
 *   --verify     assert every storage_path 200s and has a thumb/ sibling.
 *   --cleanup    delete old flat objects + orphans. Runs --verify first, internally.
 *   --rollback   restore storage_path values from the manifest.
 *
 * Flags:
 *   --yes            required to actually run --migrate / --cleanup / --rollback.
 *   --quality=82     WebP quality for full images (thumbs use quality-4).
 *   --max-edge=1600  longest edge of the full image.
 *   --thumb=400      longest edge of the thumbnail.
 *   --concurrency=4  parallel images.
 *   --sample=7       dry-run only: how many real images to download to project size.
 *   --force          --migrate only: proceed even though a manifest already exists.
 *   --allow-orphan-order-refs
 *                    --cleanup only: delete old objects even if order_items.image_url
 *                    still hardcodes their public URL. See SAFETY note below.
 *
 * SAFETY MODEL
 *   1. Nothing is deleted by --migrate. Old objects survive until --cleanup.
 *   2. --cleanup refuses to run unless --verify passes on the CURRENT database state.
 *   3. --cleanup refuses to delete an object whose public URL is still hardcoded in
 *      order_items.image_url (historical orders) unless explicitly overridden.
 *   4. --migrate is fail-fast: the first image that fails to download, re-encode or
 *      upload aborts the whole run. Rows already migrated stay in the manifest.
 *   5. The manifest is flushed to disk after every single row, so an abort mid-run
 *      is always rollback-able.
 *   6. Uploads use upsert:false — the script will never silently clobber an object.
 *   7. --migrate refuses to start if a manifest already exists (guard against a
 *      second run overwriting the rollback data of the first).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(__dirname, 'migration-manifest.json');

const BUCKET = 'product-images';
const PREFIX = 'products';
const ORPHAN_ALLOWLIST = ['directus-health-file'];

// ---------------------------------------------------------------- args & env

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

const STAGES = ['dry-run', 'migrate', 'verify', 'cleanup', 'rollback'];
const selected = STAGES.filter(flag);
if (selected.length > 1) {
  console.error(`Pick exactly one stage. Got: ${selected.join(', ')}`);
  process.exit(2);
}
const STAGE = selected[0] ?? 'dry-run';

const QUALITY = Number(opt('quality', 82));
const MAX_EDGE = Number(opt('max-edge', 1600));
const THUMB_EDGE = Number(opt('thumb', 400));
const CONCURRENCY = Number(opt('concurrency', 4));
const SAMPLE_N = Number(opt('sample', 7));
const CONFIRMED = flag('yes');
const FORCE = flag('force');
const ALLOW_ORDER_REFS = flag('allow-orphan-order-refs');

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) die(`.env not found at ${envPath}`);
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv();
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  die('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env');
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------- utilities

function die(msg) {
  console.error(`\nABORT: ${msg}\n`);
  process.exit(1);
}
const bytes = (n) => {
  if (n == null) return '   n/a';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};
const pct = (a, b) => (b === 0 ? '0%' : `${((a / b) * 100).toFixed(1)}%`);
const rule = (c = '-') => console.log(c.repeat(78));

function publicUrl(p) {
  return db.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
}

/** Run `fn` over `items` with bounded concurrency; rejects on first failure. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  let failed = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length && !failed) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        failed ??= e;
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw failed;
  return results;
}

// ---------------------------------------------------------------- encoder

/**
 * sharp is not a direct dependency — it arrives transitively via astro's image
 * optimisation. Resolve it defensively and degrade to copy-only if absent.
 */
async function resolveEncoder() {
  try {
    const mod = await import('sharp');
    const sharp = mod.default ?? mod;
    // Prove the binary actually works AND that WebP output is compiled in,
    // rather than trusting that the package directory exists.
    if (!sharp.format?.webp?.output?.buffer) {
      return { ok: false, reason: 'sharp is installed but has no WebP output support' };
    }
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .webp()
      .toBuffer();
    return { ok: true, sharp, version: sharp.versions?.sharp, vips: sharp.versions?.vips };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function makeEncoders(sharp) {
  return {
    full: (buf) =>
      sharp(buf)
        .rotate() // bake in EXIF orientation before we discard metadata
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer(),
    thumb: (buf) =>
      sharp(buf)
        .rotate()
        .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: Math.max(1, QUALITY - 4) })
        .toBuffer(),
    meta: (buf) => sharp(buf).metadata(),
  };
}

// ---------------------------------------------------------------- data access

async function fetchRows() {
  const { data, error } = await db
    .from('product_images')
    .select('id, product_id, storage_path, display_order, is_primary')
    .order('product_id')
    .order('display_order');
  if (error) die(`could not read product_images: ${error.message}`);
  return data;
}

async function fetchProductNames() {
  const { data, error } = await db.from('products').select('id, name');
  if (error) return new Map();
  return new Map(data.map((p) => [p.id, p.name]));
}

async function listObjects() {
  const out = [];
  const walk = async (dir) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await db.storage
        .from(BUCKET)
        .list(dir, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) die(`could not list storage "${dir}": ${error.message}`);
      if (!data.length) break;
      for (const o of data) {
        const full = dir ? `${dir}/${o.name}` : o.name;
        // Supabase represents a pseudo-folder as an entry with no id/metadata.
        if (o.id == null) await walk(full);
        else out.push({ name: full, size: o.metadata?.size ?? null, mime: o.metadata?.mimetype });
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  };
  await walk('');
  return out;
}

/**
 * order_items.image_url stores ABSOLUTE public URLs, not storage paths. Those
 * rows are historical receipts and are not rewritten by this migration, so any
 * old object they point at must survive cleanup.
 */
async function fetchOrderItemRefs() {
  const { data, error } = await db.from('order_items').select('image_url').not('image_url', 'is', null);
  if (error) return { supported: false, paths: new Map(), error: error.message };
  const paths = new Map();
  const marker = `/${BUCKET}/`;
  for (const r of data) {
    const i = r.image_url.indexOf(marker);
    if (i === -1) continue;
    const p = decodeURIComponent(r.image_url.slice(i + marker.length));
    paths.set(p, (paths.get(p) ?? 0) + 1);
  }
  return { supported: true, paths };
}

// ---------------------------------------------------------------- planning

function planFor(rows, encodeOk) {
  const ext = encodeOk ? 'webp' : 'png';
  return rows.map((r) => {
    const uuid = crypto.randomUUID();
    const dir = `${PREFIX}/${r.product_id}`;
    return {
      rowId: r.id,
      productId: r.product_id,
      oldPath: r.storage_path,
      newPath: `${dir}/${uuid}.${ext}`,
      thumbPath: encodeOk ? `${dir}/thumb/${uuid}.${ext}` : null,
      isPrimary: r.is_primary,
      displayOrder: r.display_order,
    };
  });
}

function thumbSiblingOf(fullPath) {
  const i = fullPath.lastIndexOf('/');
  if (i === -1) return null;
  return `${fullPath.slice(0, i)}/thumb/${fullPath.slice(i + 1)}`;
}

// ---------------------------------------------------------------- manifest

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    die(`manifest at ${MANIFEST_PATH} is not valid JSON: ${e.message}`);
  }
}

function writeManifest(m) {
  m.updatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

// ---------------------------------------------------------------- stage: dry-run

async function stageDryRun(encoder) {
  const [rows, names, objects, orderRefs] = await Promise.all([
    fetchRows(),
    fetchProductNames(),
    listObjects(),
    fetchOrderItemRefs(),
  ]);

  const sizeOf = new Map(objects.map((o) => [o.name, o.size]));
  const referenced = new Set(rows.map((r) => r.storage_path));
  const orphans = objects.filter((o) => !referenced.has(o.name));
  const broken = rows.filter((r) => !sizeOf.has(r.storage_path));
  const alreadyMigrated = rows.filter((r) => r.storage_path.startsWith(`${PREFIX}/`));

  console.log('');
  rule('=');
  console.log('  DRY RUN — product-images reorganisation. NOTHING WILL BE WRITTEN.');
  rule('=');
  console.log(`  bucket          ${BUCKET}`);
  console.log(`  target          ${PREFIX}/<productId>/<uuid>.<ext>`);
  console.log(`                  ${PREFIX}/<productId>/thumb/<uuid>.<ext>`);
  console.log(`  rows            ${rows.length}`);
  console.log(`  objects         ${objects.length}`);

  if (encoder.ok) {
    console.log(`  encoder         sharp ${encoder.version} (libvips ${encoder.vips}) — WebP OK`);
    console.log(`  full            longest edge <= ${MAX_EDGE}px, WebP q${QUALITY}`);
    console.log(`  thumb           longest edge <= ${THUMB_EDGE}px, WebP q${Math.max(1, QUALITY - 4)}`);
  } else {
    console.log('');
    rule('!');
    console.log('  !!  NO IMAGE ENCODER AVAILABLE — FALLING BACK TO COPY-ONLY MODE  !!');
    rule('!');
    console.log(`  reason: ${encoder.reason}`);
    console.log('  Files will be MOVED to the new convention with their original .png');
    console.log('  extension and NO thumbnails will be generated. Because Supabase image');
    console.log('  transformation is disabled on this plan, the storefront will keep');
    console.log('  serving full-size PNGs to every thumbnail slot.');
    console.log('  No dependency will be installed. Re-run after adding sharp to get WebP.');
    rule('!');
  }

  if (broken.length) {
    console.log('');
    console.log(`  WARNING: ${broken.length} row(s) point at a missing object:`);
    for (const r of broken.slice(0, 20)) console.log(`    - ${r.storage_path}`);
    console.log('  --migrate will abort rather than skip these.');
  }
  if (alreadyMigrated.length) {
    console.log('');
    console.log(`  NOTE: ${alreadyMigrated.length} row(s) already use the ${PREFIX}/ convention.`);
    console.log('  They would be re-encoded and re-pathed again. Consider filtering first.');
  }

  // ---- per-product plan
  const byProduct = new Map();
  const plan = planFor(rows, encoder.ok);
  for (const p of plan) {
    if (!byProduct.has(p.productId)) byProduct.set(p.productId, []);
    byProduct.get(p.productId).push(p);
  }

  console.log('');
  rule('=');
  console.log('  PLAN BY PRODUCT');
  rule('=');
  let totalOld = 0;
  for (const [pid, items] of byProduct) {
    const sub = items.reduce((a, i) => a + (sizeOf.get(i.oldPath) ?? 0), 0);
    totalOld += sub;
    console.log('');
    console.log(`  ${names.get(pid) ?? '(unknown product)'}`);
    console.log(`  product_id ${pid}`);
    console.log(`  ${items.length} image(s), ${bytes(sub)}`);
    console.log(`     ${PREFIX}/${pid}/`);
    for (const i of items.slice(0, 3)) {
      console.log(
        `       ${i.oldPath.padEnd(30)} -> ${i.newPath.slice(i.newPath.lastIndexOf('/') + 1)}  (${bytes(sizeOf.get(i.oldPath))})`,
      );
    }
    if (items.length > 3) console.log(`       ... and ${items.length - 3} more, same pattern`);
    if (encoder.ok) console.log(`     ${PREFIX}/${pid}/thumb/   <- ${items.length} thumbnail(s), new objects`);
  }

  // ---- size projection from real samples
  console.log('');
  rule('=');
  console.log('  SIZE PROJECTION');
  rule('=');
  console.log(`  current total (99 referenced objects)   ${bytes(totalOld)}`);

  if (encoder.ok && SAMPLE_N > 0) {
    // One representative image per product, up to SAMPLE_N.
    const picks = [...byProduct.values()].map((v) => v[0]).slice(0, SAMPLE_N);
    console.log(`  sampling ${picks.length} real image(s) to measure the actual ratio...`);
    console.log('');
    let sOld = 0;
    let sFull = 0;
    let sThumb = 0;
    const enc = makeEncoders(encoder.sharp);
    for (const p of picks) {
      try {
        const buf = await download(p.oldPath);
        const meta = await enc.meta(buf);
        const [f, t] = await Promise.all([enc.full(buf), enc.thumb(buf)]);
        sOld += buf.length;
        sFull += f.length;
        sThumb += t.length;
        console.log(
          `    ${p.oldPath.padEnd(30)} ${String(meta.width).padStart(4)}x${String(meta.height).padEnd(4)}` +
            ` ${bytes(buf.length).padStart(9)} -> full ${bytes(f.length).padStart(9)} + thumb ${bytes(t.length).padStart(9)}`,
        );
      } catch (e) {
        console.log(`    ${p.oldPath.padEnd(30)} SAMPLE FAILED: ${e.message}`);
      }
    }
    if (sOld > 0) {
      const ratio = (sFull + sThumb) / sOld;
      console.log('');
      console.log(`  sampled  ${bytes(sOld)} -> ${bytes(sFull + sThumb)}  (${pct(sFull + sThumb, sOld)} of original)`);
      console.log(`  projected new total (full+thumb)       ${bytes(totalOld * ratio)}`);
      console.log(`  projected saving                       ${bytes(totalOld - totalOld * ratio)}  (${pct(totalOld - totalOld * ratio, totalOld)} smaller)`);
      console.log('');
      console.log('  NOTE: projection extrapolates one sample per product across all rows.');
      console.log('  Actual totals will differ; --migrate reports the real figure.');
      console.log(`  Peak storage during migration (old + new, before --cleanup): ~${bytes(totalOld + totalOld * ratio)}`);
    }
  } else if (!encoder.ok) {
    console.log(`  projected new total                    ${bytes(totalOld)}  (copy-only: byte-identical)`);
    console.log('  projected saving                       0 B — no re-encoding possible.');
    console.log(`  Peak storage during migration          ~${bytes(totalOld * 2)} (old + copies)`);
  }

  // ---- orphans
  console.log('');
  rule('=');
  console.log('  ORPHANS — objects no product_images row references');
  rule('=');
  if (!orphans.length) {
    console.log('  none');
  } else {
    for (const o of orphans) {
      const known = ORPHAN_ALLOWLIST.includes(o.name);
      console.log(`    ${o.name.padEnd(34)} ${bytes(o.size).padStart(9)}  ${o.mime ?? ''}${known ? '  [known: abandoned Directus trial]' : '  [UNEXPECTED — review before deleting]'}`);
    }
    console.log('');
    console.log('  These would be deleted by --cleanup, never by --migrate.');
  }

  // ---- hardcoded URL coupling
  console.log('');
  rule('=');
  console.log('  HARDCODED URL REFERENCES (cleanup blockers)');
  rule('=');
  if (!orderRefs.supported) {
    console.log(`  could not read order_items: ${orderRefs.error}`);
  } else if (orderRefs.paths.size === 0) {
    console.log('  none — no order_items.image_url points into this bucket.');
  } else {
    console.log('  order_items.image_url stores ABSOLUTE public URLs to flat paths.');
    console.log('  This migration does NOT rewrite them, so deleting these old objects');
    console.log('  would break the image on historical order/receipt views.');
    console.log('');
    for (const [p, n] of orderRefs.paths) {
      console.log(`    ${p.padEnd(34)} referenced by ${n} order_item row(s)`);
    }
    console.log('');
    console.log('  --cleanup will REFUSE to delete these unless --allow-orphan-order-refs.');
  }

  console.log('');
  rule('=');
  console.log('  NEXT STEPS');
  rule('=');
  console.log('  1. A human reviews this plan.');
  console.log('  2. node scripts/migrate-images.mjs --migrate --yes');
  console.log('  3. node scripts/migrate-images.mjs --verify');
  console.log('  4. node scripts/migrate-images.mjs --cleanup --yes   (only after 3 passes)');
  console.log('     rollback at any point: --rollback --yes');
  console.log('');
  console.log('  Nothing was written. Manifest not created.');
  rule('=');
  console.log('');
}

// ---------------------------------------------------------------- transfer helpers

async function download(p) {
  const { data, error } = await db.storage.from(BUCKET).download(p);
  if (error) throw new Error(`download ${p}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function upload(p, buf, contentType) {
  const { error } = await db.storage.from(BUCKET).upload(p, buf, {
    contentType,
    cacheControl: '31536000',
    upsert: false, // never silently clobber
  });
  if (error) throw new Error(`upload ${p}: ${error.message}`);
}

// ---------------------------------------------------------------- stage: migrate

async function stageMigrate(encoder) {
  if (!CONFIRMED) die('--migrate writes to storage and the database. Re-run with --yes.');

  const existing = readManifest();
  if (existing && !FORCE) {
    die(
      `a manifest already exists at ${MANIFEST_PATH} (${existing.entries?.length ?? 0} entries).\n` +
        '       Running --migrate again would overwrite the only rollback record.\n' +
        '       Finish or --rollback the previous run, move the manifest aside, or pass --force.',
    );
  }

  const rows = await fetchRows();
  const objects = await listObjects();
  const have = new Set(objects.map((o) => o.name));

  // Pre-flight: every row must resolve, or we do not start at all.
  const broken = rows.filter((r) => !have.has(r.storage_path));
  if (broken.length) {
    die(`${broken.length} row(s) reference a missing object; refusing to start. First: ${broken[0].storage_path}`);
  }

  const plan = planFor(rows, encoder.ok);
  const collisions = plan.filter((p) => have.has(p.newPath) || (p.thumbPath && have.has(p.thumbPath)));
  if (collisions.length) die(`${collisions.length} generated path(s) already exist. Re-run to get fresh UUIDs.`);

  const enc = encoder.ok ? makeEncoders(encoder.sharp) : null;
  const manifest = {
    createdAt: new Date().toISOString(),
    bucket: BUCKET,
    mode: encoder.ok ? 'webp' : 'copy-only',
    encoder: encoder.ok ? `sharp ${encoder.version}` : null,
    options: { quality: QUALITY, maxEdge: MAX_EDGE, thumbEdge: THUMB_EDGE },
    complete: false,
    entries: [],
  };
  writeManifest(manifest);

  let oldBytes = 0;
  let newBytes = 0;
  let done = 0;

  console.log(`Migrating ${plan.length} image(s) in ${manifest.mode} mode...`);

  try {
    await mapLimit(plan, CONCURRENCY, async (p) => {
      const src = await download(p.oldPath);
      let fullBuf = src;
      let thumbBuf = null;
      let ct = 'image/png';

      if (enc) {
        try {
          [fullBuf, thumbBuf] = await Promise.all([enc.full(src), enc.thumb(src)]);
        } catch (e) {
          throw new Error(`re-encode failed for ${p.oldPath}: ${e.message}`);
        }
        ct = 'image/webp';
      }

      await upload(p.newPath, fullBuf, ct);
      if (thumbBuf) await upload(p.thumbPath, thumbBuf, ct);

      const { error } = await db
        .from('product_images')
        .update({ storage_path: p.newPath })
        .eq('id', p.rowId);
      if (error) throw new Error(`db update ${p.rowId}: ${error.message}`);

      // new -> old, for rollback. Flushed immediately.
      manifest.entries.push({
        rowId: p.rowId,
        productId: p.productId,
        newPath: p.newPath,
        thumbPath: p.thumbPath,
        oldPath: p.oldPath,
        oldBytes: src.length,
        newBytes: fullBuf.length + (thumbBuf?.length ?? 0),
      });
      writeManifest(manifest);

      oldBytes += src.length;
      newBytes += fullBuf.length + (thumbBuf?.length ?? 0);
      done += 1;
      if (done % 10 === 0) console.log(`  ${done}/${plan.length}`);
    });
  } catch (e) {
    writeManifest(manifest);
    die(
      `${e.message}\n       ${manifest.entries.length} image(s) were already migrated and are recorded in\n` +
        `       ${MANIFEST_PATH}. Nothing was deleted. Run --rollback --yes to undo.`,
    );
  }

  manifest.complete = true;
  writeManifest(manifest);
  console.log(`\nDone. ${bytes(oldBytes)} -> ${bytes(newBytes)} (${pct(newBytes, oldBytes)} of original).`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log('Old objects are UNTOUCHED. Run --verify, then --cleanup --yes.');
}

// ---------------------------------------------------------------- stage: verify

async function stageVerify({ quiet = false } = {}) {
  const rows = await fetchRows();
  const manifest = readManifest();
  const expectThumbs = manifest ? manifest.mode === 'webp' : true;
  const failures = [];

  const log = (...a) => !quiet && console.log(...a);
  log(`Verifying ${rows.length} row(s) over public URLs...`);

  await mapLimit(rows, CONCURRENCY, async (r) => {
    const fullUrl = publicUrl(r.storage_path);
    const res = await fetch(fullUrl, { method: 'HEAD' });
    if (!res.ok) {
      failures.push({ row: r.id, path: r.storage_path, kind: 'full', status: res.status });
      return;
    }
    if (!r.storage_path.startsWith(`${PREFIX}/`)) {
      failures.push({ row: r.id, path: r.storage_path, kind: 'convention', status: 'not under products/' });
    }
    if (!expectThumbs) return;
    const tp = thumbSiblingOf(r.storage_path);
    if (!tp) {
      failures.push({ row: r.id, path: r.storage_path, kind: 'thumb', status: 'no directory to derive thumb from' });
      return;
    }
    const tres = await fetch(publicUrl(tp), { method: 'HEAD' });
    if (!tres.ok) failures.push({ row: r.id, path: tp, kind: 'thumb', status: tres.status });
  });

  if (failures.length) {
    log(`\nFAILED: ${failures.length} problem(s).`);
    for (const f of failures.slice(0, 40)) log(`  [${f.kind}] ${f.path} -> ${f.status}`);
    if (failures.length > 40) log(`  ... and ${failures.length - 40} more`);
  } else {
    log(`\nOK: all ${rows.length} full image(s)${expectThumbs ? ' and thumbnails' : ''} return 200 and follow the convention.`);
  }
  return failures;
}

// ---------------------------------------------------------------- stage: cleanup

async function stageCleanup() {
  if (!CONFIRMED) die('--cleanup permanently deletes objects. Re-run with --yes.');

  const manifest = readManifest();
  if (!manifest) die('no manifest — nothing is known to be safe to delete. Run --migrate first.');
  if (!manifest.complete && !FORCE) {
    die('manifest is marked incomplete (a --migrate run aborted). Resolve that before cleanup, or pass --force.');
  }

  console.log('Gate 1/3: running --verify against the current database state...');
  const failures = await stageVerify({ quiet: false });
  if (failures.length) die(`verification failed with ${failures.length} problem(s). NOTHING deleted.`);

  console.log('\nGate 2/3: confirming every new object is actually present in storage...');
  const objects = await listObjects();
  const have = new Set(objects.map((o) => o.name));
  const missingNew = manifest.entries.filter(
    (e) => !have.has(e.newPath) || (e.thumbPath && !have.has(e.thumbPath)),
  );
  if (missingNew.length) die(`${missingNew.length} migrated object(s) are missing from storage. NOTHING deleted.`);

  console.log('Gate 3/3: checking for hardcoded URL references to the old objects...');
  const orderRefs = await fetchOrderItemRefs();
  const candidates = manifest.entries.map((e) => e.oldPath);
  const blocked = candidates.filter((p) => orderRefs.paths.has(p));
  if (blocked.length && !ALLOW_ORDER_REFS) {
    console.log('');
    for (const p of blocked) console.log(`  BLOCKED ${p} — ${orderRefs.paths.get(p)} order_item row(s) link to it`);
    die(
      `${blocked.length} old object(s) are still referenced by order_items.image_url.\n` +
        '       Deleting them breaks images on historical orders. Either rewrite those\n' +
        '       URLs first, or accept the breakage with --allow-orphan-order-refs.',
    );
  }

  const referencedNow = new Set((await fetchRows()).map((r) => r.storage_path));
  const toDelete = [
    ...candidates.filter((p) => !referencedNow.has(p)), // never delete a live path
    ...objects.filter((o) => ORPHAN_ALLOWLIST.includes(o.name)).map((o) => o.name),
  ];
  const unique = [...new Set(toDelete)];

  console.log(`\nAll gates passed. Deleting ${unique.length} object(s)...`);
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const { error } = await db.storage.from(BUCKET).remove(batch);
    if (error) die(`delete failed on batch starting ${batch[0]}: ${error.message}`);
    console.log(`  removed ${Math.min(i + 100, unique.length)}/${unique.length}`);
  }

  manifest.cleanedUpAt = new Date().toISOString();
  manifest.cleanedUpCount = unique.length;
  writeManifest(manifest);
  console.log('\nCleanup complete. NOTE: rollback of storage_path is still possible from the');
  console.log('manifest, but the old objects are gone — rollback would leave broken paths.');
}

// ---------------------------------------------------------------- stage: rollback

async function stageRollback() {
  if (!CONFIRMED) die('--rollback rewrites storage_path values. Re-run with --yes.');
  const manifest = readManifest();
  if (!manifest) die(`no manifest at ${MANIFEST_PATH}; nothing to roll back.`);
  if (manifest.cleanedUpAt) {
    console.log('WARNING: --cleanup already ran. The old objects no longer exist.');
    console.log('Restoring storage_path will point rows at deleted objects.');
    if (!FORCE) die('refusing without --force.');
  }

  console.log(`Restoring ${manifest.entries.length} storage_path value(s)...`);
  let n = 0;
  for (const e of manifest.entries) {
    const { error } = await db.from('product_images').update({ storage_path: e.oldPath }).eq('id', e.rowId);
    if (error) die(`rollback failed on row ${e.rowId}: ${error.message}. ${n} row(s) restored so far.`);
    n += 1;
  }
  console.log(`Restored ${n} row(s). New objects were NOT deleted — remove them manually if desired.`);
}

// ---------------------------------------------------------------- main

const encoder = await resolveEncoder();

switch (STAGE) {
  case 'dry-run':
    await stageDryRun(encoder);
    break;
  case 'migrate':
    await stageMigrate(encoder);
    break;
  case 'verify': {
    const f = await stageVerify();
    process.exit(f.length ? 1 : 0);
  }
  case 'cleanup':
    await stageCleanup();
    break;
  case 'rollback':
    await stageRollback();
    break;
}
