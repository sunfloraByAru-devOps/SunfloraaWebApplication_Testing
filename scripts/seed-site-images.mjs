#!/usr/bin/env node
/**
 * seed-site-images.mjs — move the landing page's pictures into the database.
 *
 * Until now the home page's category cards, community wall and founder photo
 * were hardcoded arrays in four .astro components. The components now read
 * site_images and categories instead, and site-content.ts fails the build
 * rather than shipping an empty section — so this script has to run BEFORE the
 * first build on the new code, or that build will fail by design.
 *
 * Stages (pick exactly one):
 *   --dry-run                (default) print the whole plan. Touches nothing.
 *   --seed                   upload the pictures and write the rows.
 *   --backfill-dimensions    record width/height for photos uploaded before
 *                            the dashboard started saving them.
 *   --pick-defaults          put a plausible starting set of products into the
 *                            two home page carousels. This is a SUGGESTION, not
 *                            a migration: which products to feature is Aru's
 *                            editorial call and she changes it in the dashboard
 *                            under Products. It exists only so the first build
 *                            after this change has something to render — the
 *                            carousels previously showed invented products, so
 *                            there is nothing real to carry over. Skips
 *                            entirely if anything is already picked.
 *   --verify                 assert every referenced object 200s and every row
 *                            has usable dimensions.
 *
 * Flags:
 *   --yes                    required for --seed and --backfill-dimensions.
 *   --portrait=<path>        the founder's photo. There is no sensible default:
 *                            the picture it replaces was hot-linked from a
 *                            WhatsApp CDN URL with an expiry signature and
 *                            cannot be re-downloaded. Aru has to supply a file.
 *   --quality=82             WebP quality.
 *   --max-edge=900           longest edge. Matches SITE_TARGET.fullEdge in
 *                            src/lib/admin/images.ts — these render at 260-420px,
 *                            and every extra pixel is re-downloaded and
 *                            re-encoded by Astro on every single publish.
 *   --thumb=400              longest edge of the thumbnail.
 *   --force                  --seed only: add pictures to a group that already
 *                            has some. Without it, a populated group is skipped,
 *                            so re-running cannot produce duplicates.
 *
 * SAFETY
 *   1. Nothing is ever deleted.
 *   2. Uploads use upsert:false, so an existing object is never clobbered.
 *   3. --seed skips any group or category that already has a picture, which
 *      makes the whole script re-runnable.
 *   4. If a row insert fails, the objects it would have pointed at are removed
 *      again — the same compensating-delete discipline the dashboard uses.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const SITE_BUCKET = 'site-images';
const PRODUCT_BUCKET = 'product-images';
const PREFIX = 'site';

// ---------------------------------------------------------------- args & env

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

const STAGES = ['dry-run', 'seed', 'backfill-dimensions', 'pick-defaults', 'verify'];
const selected = STAGES.filter(flag);
if (selected.length > 1) {
  console.error(`Pick exactly one stage. Got: ${selected.join(', ')}`);
  process.exit(2);
}
const STAGE = selected[0] ?? 'dry-run';

const QUALITY = Number(opt('quality', 82));
const MAX_EDGE = Number(opt('max-edge', 900));
const THUMB_EDGE = Number(opt('thumb', 400));
const PORTRAIT = opt('portrait', null);
const CONFIRMED = flag('yes');
const FORCE = flag('force');

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
  if (n == null) return 'n/a';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};
const rule = (c = '-') => console.log(c.repeat(78));
const publicUrl = (bucket, p) => db.storage.from(bucket).getPublicUrl(p).data.publicUrl;

/* Matches newKey()/thumbKeyFor() in src/lib/admin/images.ts. Both writers have
   to agree, or a thumbnail uploaded by one is invisible to the other. */
const newKey = (folder) => `${PREFIX}/${folder}/${crypto.randomUUID()}.webp`;
const thumbKeyFor = (key) => {
  const i = key.lastIndexOf('/');
  return i < 0 ? `thumb/${key}` : `${key.slice(0, i)}/thumb/${key.slice(i + 1)}`;
};

// ---------------------------------------------------------------- encoder

/** sharp arrives transitively via astro's image optimisation, not as a direct
 *  dependency, so resolve it defensively and say so plainly if it is unusable. */
async function resolveSharp() {
  try {
    const mod = await import('sharp');
    const sharp = mod.default ?? mod;
    if (!sharp.format?.webp?.output?.buffer) {
      die('sharp is installed but has no WebP output support — cannot encode.');
    }
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .webp().toBuffer();
    return sharp;
  } catch (e) {
    die(`sharp is required for this script and could not be loaded: ${e.message}`);
  }
}

/** Re-encode to WebP at both sizes and report the dimensions of the full one -
 *  the numbers that go into the database and then into <Image>. */
async function encodePair(sharp, buf) {
  const full = await sharp(buf).rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(buf).rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: Math.max(1, QUALITY - 4) }).toBuffer();
  return {
    full: full.data,
    thumb,
    width: full.info.width,
    height: full.info.height,
  };
}

/* A UUID key names one immutable object, so cache it for a year. Matches
   CACHE_CONTROL in src/lib/admin/images.ts. */
const CACHE_CONTROL = '31536000';

async function uploadPair(folder, encoded) {
  const key = newKey(folder);
  const tKey = thumbKeyFor(key);

  const up = await db.storage.from(SITE_BUCKET).upload(key, encoded.full, {
    contentType: 'image/webp', cacheControl: CACHE_CONTROL, upsert: false,
  });
  if (up.error) throw new Error(`upload ${key}: ${up.error.message}`);

  const upT = await db.storage.from(SITE_BUCKET).upload(tKey, encoded.thumb, {
    contentType: 'image/webp', cacheControl: CACHE_CONTROL, upsert: false,
  });
  if (upT.error) {
    await db.storage.from(SITE_BUCKET).remove([key]).catch(() => {});
    throw new Error(`upload ${tKey}: ${upT.error.message}`);
  }
  return key;
}

async function removePair(key) {
  await db.storage.from(SITE_BUCKET).remove([key, thumbKeyFor(key)]).catch(() => {});
}

function readSource(rel) {
  const full = path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return { path: full, buf: fs.readFileSync(full) };
}

// ---------------------------------------------------------------- the content

/* The eight community photos and their quotes, lifted verbatim from the
   galleryItems array that used to live in LandingFounder.astro. The alt text is
   new: every one of them previously shared the same "Sunflora customer moment",
   which told a screen reader nothing about which picture it was looking at. */
const COMMUNITY = [
  { file: 'src/assets/yellow_rose_bouquet.jpg',
    alt: 'A yellow crochet rose bouquet wrapped as a gift',
    caption: 'Wrapped this one at midnight — the detail on the petals is unreal.' },
  { file: 'src/assets/crochet_hair_clips.png',
    alt: 'A set of crochet flower hair clips',
    caption: 'So soft and well made, exactly like the photos. Ordering more!' },
  { file: 'src/assets/sun_and_moon.jpg',
    alt: 'Crochet sun and moon amigurumi sitting together',
    caption: 'My Sunny came home today! Even better in person.' },
  { file: 'src/assets/Sunflower_Pot_1.png',
    alt: 'A crochet sunflower in a small pot on a desk',
    caption: 'Perfect little desk companion. Great quality for the price.' },
  { file: 'src/assets/Yello_orchid_(1).jpg',
    alt: 'A yellow crochet orchid stem',
    caption: 'Best unboxing moment — the packaging alone felt like a gift.' },
  { file: 'src/assets/sun_on_desk.png',
    alt: 'A crochet sun amigurumi on a desk',
    caption: 'Found the perfect little spot for it. Love the craftsmanship.' },
  { file: 'src/assets/sunflower_rosebig_.jpg',
    alt: 'A large crochet sunflower and rose arrangement',
    caption: 'Bigger and cozier than I expected. Worth every rupee.' },
  { file: 'src/assets/sun_on_couch.jpg',
    alt: 'A crochet sun amigurumi resting on a couch',
    caption: 'Settling into his new home. Already my favorite thing on the couch.' },
];

/* Category name -> the picture that actually depicts it.
 *
 * The old cards were labelled Flower Bouquets / Soft Toys / Flower Pots /
 * Cushions and linked to Bouquets / Amigurumi / Wall Hangings / Keychains, so
 * two of the four showed a photo of something the shelf did not sell. Only
 * honest pairings are seeded here: the cushion photo is deliberately not
 * carried over to Keychains, which gets a real keychain instead.
 *
 * A category that does not exist in this database is skipped and reported. */
const CATEGORY_IMAGES = [
  { name: 'Bouquets',      file: 'public/images/landing/lify-bouquet.PNG',
    alt: 'A handmade crochet lily bouquet' },
  { name: 'Amigurumi',     file: 'public/images/landing/hanuman.PNG',
    alt: 'A handmade crochet amigurumi soft toy' },
  { name: 'Wall Hangings', file: 'public/images/landing/flower_pot.PNG',
    alt: 'A crochet flower pot for home decor' },
  { name: 'Keychains',     file: 'src/assets/crochet_daisy_keychain.png',
    alt: 'A crochet daisy keychain' },
  { name: 'Flower Stems',  file: 'src/assets/crochet_tulip_bouquet.png',
    alt: 'Crochet tulip stems' },
];

// ---------------------------------------------------------------- stages

async function fetchGroups() {
  const { data, error } = await db.from('site_image_groups').select('key, label, is_singleton');
  if (error) die(`cannot read site_image_groups: ${error.message}\nHas supabase/sql/10_landing_content.sql been applied?`);
  if (!data?.length) die('site_image_groups is empty — apply supabase/sql/10_landing_content.sql first.');
  return data;
}

async function existingCount(key) {
  const { count, error } = await db.from('site_images')
    .select('id', { count: 'exact', head: true }).eq('key', key);
  if (error) die(`cannot count site_images for ${key}: ${error.message}`);
  return count ?? 0;
}

async function seed(sharp) {
  await fetchGroups();
  let uploaded = 0;

  // -- community wall ------------------------------------------------------
  const wallCount = await existingCount('community_wall');
  if (wallCount > 0 && !FORCE) {
    console.log(`community_wall already has ${wallCount} photo(s) — skipping (use --force to add more).`);
  } else {
    for (const [i, item] of COMMUNITY.entries()) {
      const src = readSource(item.file);
      if (!src) { console.log(`  ! missing source, skipped: ${item.file}`); continue; }
      const enc = await encodePair(sharp, src.buf);
      const key = await uploadPair('community_wall', enc);
      const { error } = await db.from('site_images').insert({
        key: 'community_wall', storage_path: key, alt: item.alt, caption: item.caption,
        width: enc.width, height: enc.height, display_order: i, is_active: true,
      });
      if (error) { await removePair(key); die(`insert site_images: ${error.message}`); }
      console.log(`  + community_wall  ${path.basename(item.file)}  ->  ${enc.width}x${enc.height}  ${bytes(enc.full.length)}`);
      uploaded++;
    }
  }

  // -- founder portrait ----------------------------------------------------
  const portraitCount = await existingCount('founder_portrait');
  if (!PORTRAIT) {
    console.log(
      portraitCount > 0
        ? 'founder_portrait already set — no --portrait given, leaving it alone.'
        : 'founder_portrait is EMPTY and no --portrait=<path> was given.\n' +
          '  The build will fail until one is supplied here or uploaded in the dashboard.\n' +
          '  The photo it replaces was hot-linked from WhatsApp with an expiry signature,\n' +
          '  so there is nothing to copy — Aru has to provide a file.',
    );
  } else {
    const src = readSource(PORTRAIT);
    if (!src) die(`--portrait file not found: ${PORTRAIT}`);
    const enc = await encodePair(sharp, src.buf);
    const key = await uploadPair('founder_portrait', enc);
    const { error } = await db.from('site_images').insert({
      key: 'founder_portrait', storage_path: key,
      alt: 'Aru Jaiswal, founder of Sunflora', caption: null,
      width: enc.width, height: enc.height, display_order: 0, is_active: true,
    });
    if (error) { await removePair(key); die(`insert founder portrait: ${error.message}`); }
    // The singleton trigger retires any previous portrait for us.
    console.log(`  + founder_portrait  ${path.basename(src.path)}  ->  ${enc.width}x${enc.height}  ${bytes(enc.full.length)}`);
    uploaded++;
  }

  // -- category cards ------------------------------------------------------
  const { data: cats, error: catErr } = await db.from('categories')
    .select('id, name, image_path, display_order');
  if (catErr) die(`cannot read categories: ${catErr.message}`);

  let order = 0;
  for (const spec of CATEGORY_IMAGES) {
    const cat = (cats ?? []).find((c) => c.name?.toLowerCase() === spec.name.toLowerCase());
    if (!cat) { console.log(`  ~ no category named "${spec.name}" — skipped.`); continue; }
    if (cat.image_path && !FORCE) {
      console.log(`  ~ "${cat.name}" already has a photo — skipped.`);
      order++;
      continue;
    }
    const src = readSource(spec.file);
    if (!src) { console.log(`  ! missing source, skipped: ${spec.file}`); continue; }

    const enc = await encodePair(sharp, src.buf);
    const key = await uploadPair('categories', enc);
    const { error } = await db.from('categories').update({
      image_path: key, image_width: enc.width, image_height: enc.height,
      image_alt: spec.alt, show_on_home: true, home_order: order,
    }).eq('id', cat.id);
    if (error) { await removePair(key); die(`update category ${cat.name}: ${error.message}`); }
    console.log(`  + category "${cat.name}"  ${path.basename(spec.file)}  ->  ${enc.width}x${enc.height}  ${bytes(enc.full.length)}`);
    order++;
    uploaded++;
  }

  rule();
  console.log(`${uploaded} picture(s) uploaded.`);
  console.log('Next: pick products for the home page carousels in the dashboard');
  console.log('under Products, then run `npm run build`.');
}

/** Probe the bytes that are actually being served, so a row can never claim a
 *  size the object does not have. */
async function probe(sharp, url) {
  const res = await fetch(url);
  if (!res.ok) return { error: `${res.status} ${res.statusText}` };
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    const m = await sharp(buf).metadata();
    if (!m.width || !m.height) return { error: 'no dimensions in metadata' };
    return { width: m.width, height: m.height };
  } catch (e) {
    return { error: e.message };
  }
}

async function backfillDimensions(sharp, apply) {
  const targets = [
    { table: 'product_images', bucket: PRODUCT_BUCKET, pathCol: 'storage_path',
      wCol: 'width', hCol: 'height' },
    { table: 'site_images', bucket: SITE_BUCKET, pathCol: 'storage_path',
      wCol: 'width', hCol: 'height' },
    { table: 'categories', bucket: SITE_BUCKET, pathCol: 'image_path',
      wCol: 'image_width', hCol: 'image_height' },
  ];

  let filled = 0, failed = 0;
  for (const t of targets) {
    const { data, error } = await db.from(t.table)
      .select(`id, ${t.pathCol}, ${t.wCol}, ${t.hCol}`)
      .not(t.pathCol, 'is', null)
      .or(`${t.wCol}.is.null,${t.hCol}.is.null`);
    if (error) die(`cannot read ${t.table}: ${error.message}`);

    if (!data?.length) { console.log(`${t.table}: nothing to backfill.`); continue; }
    console.log(`${t.table}: ${data.length} row(s) missing dimensions.`);

    for (const row of data) {
      const p = row[t.pathCol];
      const url = publicUrl(t.bucket, p);
      const r = await probe(sharp, url);
      if (r.error) {
        console.log(`  ! ${t.table} ${row.id}: ${r.error}  (${p})`);
        failed++;
        continue;
      }
      if (apply) {
        const { error: uErr } = await db.from(t.table)
          .update({ [t.wCol]: r.width, [t.hCol]: r.height }).eq('id', row.id);
        if (uErr) { console.log(`  ! update ${t.table} ${row.id}: ${uErr.message}`); failed++; continue; }
      }
      console.log(`  ${apply ? '+' : '·'} ${t.table} ${row.id}  ${r.width}x${r.height}`);
      filled++;
    }
  }

  rule();
  console.log(`${filled} row(s) ${apply ? 'updated' : 'would be updated'}, ${failed} failed.`);
  if (failed) {
    console.log('A failed row means the object behind it is missing or unreadable.');
    console.log('Any product picked for the home page carousels must be fixed before');
    console.log('the next build, or site-content.ts will refuse to build the page.');
  }
}

/* A starting set for the two carousels, so the first build has something to
   render. Everything about this is provisional: the old sections listed
   invented products, so there is no previous selection to preserve, and the
   dashboard is where the real choice gets made. */
async function pickDefaults() {
  const { data: existing, error: exErr } = await db.from('products')
    .select('id').not('home_section', 'is', null).limit(1);
  if (exErr) die(`cannot read products: ${exErr.message}`);
  if (existing?.length) {
    console.log('Products are already picked for the home page — leaving them alone.');
    console.log('Change them in the dashboard under Products.');
    return;
  }

  const { data: products, error } = await db.from('products')
    .select('id, name, is_new, display_order, created_at, product_images(storage_path)')
    .eq('is_active', true)
    .eq('in_stock', true);
  if (error) die(`cannot read products: ${error.message}`);

  // No photo means no card: the storefront downloads that image while building,
  // so featuring a product without one fails the build rather than the card.
  const usable = (products ?? []).filter((p) => (p.product_images ?? []).length > 0);
  if (!usable.length) {
    die('No live, in-stock product has a photo, so nothing can be featured.\n' +
        '  Add photos in the dashboard first.');
  }

  const byOrder = [...usable].sort((a, b) =>
    (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.name.localeCompare(b.name));
  const byNewest = [...usable].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

  const best = byOrder.slice(0, 5);
  const flaggedNew = byNewest.filter((p) => p.is_new);
  // is_new is the honest signal; newest-created is the fallback when nobody
  // has been setting it.
  const fresh = (flaggedNew.length >= 3 ? flaggedNew : byNewest).slice(0, 5);

  const apply = async (rows, section) => {
    for (const [i, p] of rows.entries()) {
      const { error: uErr } = await db.from('products')
        .update({ home_section: section, home_order: i }).eq('id', p.id);
      if (uErr) die(`update ${p.name}: ${uErr.message}`);
      console.log(`  + ${section.padEnd(13)} ${i}. ${p.name}`);
    }
  };

  // A product can only sit in one section, so Latest Collection takes what
  // Most Loved did not.
  const taken = new Set(best.map((p) => p.id));
  const freshOnly = fresh.filter((p) => !taken.has(p.id));

  await apply(best, 'best_sellers');
  if (!freshOnly.length) {
    console.log('\n  ! Every usable product is already in Most Loved, so Latest');
    console.log('    Collection is empty and the build will refuse to run.');
    console.log('    Move one across in the dashboard under Products.');
  } else {
    await apply(freshOnly, 'new_arrivals');
  }

  rule();
  console.log('These are a starting point, not a decision. Change them in the');
  console.log('dashboard under Products — each row has a home page picker.');
}

async function verify(sharp) {
  let bad = 0;

  const { data: imgs } = await db.from('site_images')
    .select('id, key, storage_path, alt, width, height, is_active').eq('is_active', true);
  for (const r of imgs ?? []) {
    const res = await fetch(publicUrl(SITE_BUCKET, r.storage_path), { method: 'HEAD' });
    if (!res.ok) { console.log(`  ! site_images ${r.id} (${r.key}): object ${res.status}`); bad++; }
    if (!r.width || !r.height) { console.log(`  ! site_images ${r.id} (${r.key}): no dimensions`); bad++; }
    if (!r.alt?.trim()) { console.log(`  ! site_images ${r.id} (${r.key}): no alt text`); bad++; }
  }

  const { data: cats } = await db.from('categories')
    .select('id, name, image_path, image_width, image_height, show_on_home')
    .eq('show_on_home', true);
  for (const c of cats ?? []) {
    if (!c.image_path) { console.log(`  ! category "${c.name}": on the home page with no photo`); bad++; continue; }
    const res = await fetch(publicUrl(SITE_BUCKET, c.image_path), { method: 'HEAD' });
    if (!res.ok) { console.log(`  ! category "${c.name}": object ${res.status}`); bad++; }
    if (!c.image_width || !c.image_height) { console.log(`  ! category "${c.name}": no dimensions`); bad++; }
  }

  /* A curated product whose photo is missing or unmeasured fails the BUILD, not
     just the picture - Astro fetches it while rendering. Catching it here is the
     difference between a two-minute fix and a failed publish. */
  const { data: picks } = await db.from('products')
    .select('id, name, home_section, product_images(storage_path, is_primary, display_order, width, height)')
    .not('home_section', 'is', null).eq('is_active', true);
  for (const p of picks ?? []) {
    const list = p.product_images ?? [];
    const primary = list.find((i) => i.is_primary)
      ?? [...list].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0];
    if (!primary) { console.log(`  ! "${p.name}" is on the home page with no photo`); bad++; continue; }
    if (!primary.width || !primary.height) {
      console.log(`  ! "${p.name}" is on the home page and its photo has no dimensions`); bad++;
    }
    const res = await fetch(publicUrl(PRODUCT_BUCKET, primary.storage_path), { method: 'HEAD' });
    if (!res.ok) { console.log(`  ! "${p.name}": photo ${res.status} — the next build WILL fail`); bad++; }
  }

  rule();
  if (bad) { console.log(`${bad} problem(s) found.`); process.exitCode = 1; }
  else console.log('All landing page pictures are present, measured and described.');
}

// ---------------------------------------------------------------- main

async function main() {
  rule('=');
  console.log(`seed-site-images.mjs — stage: ${STAGE}`);
  console.log(`project: ${SUPABASE_URL}`);
  rule('=');

  const sharp = await resolveSharp();

  if (STAGE === 'dry-run') {
    console.log('\nWould upload, at most:\n');
    for (const c of COMMUNITY) {
      const src = readSource(c.file);
      console.log(`  community_wall   ${c.file}${src ? '' : '   (MISSING)'}`);
    }
    console.log(`  founder_portrait ${PORTRAIT ?? '(none given — pass --portrait=<path>)'}`);
    for (const c of CATEGORY_IMAGES) {
      const src = readSource(c.file);
      console.log(`  category "${c.name}"   ${c.file}${src ? '' : '   (MISSING)'}`);
    }
    console.log('\nExisting rows are never replaced; a populated group or category is skipped.');
    console.log('\nRe-run with --seed --yes to apply, --backfill-dimensions to');
    console.log('measure photos uploaded before dimensions were recorded, or');
    console.log('--pick-defaults to put a starting set of products in the carousels.');
    return;
  }

  if ((STAGE === 'seed' || STAGE === 'backfill-dimensions' || STAGE === 'pick-defaults') && !CONFIRMED) {
    die(`--${STAGE} writes to the database and storage. Re-run with --yes.`);
  }

  if (STAGE === 'seed') return seed(sharp);
  if (STAGE === 'pick-defaults') return pickDefaults();
  if (STAGE === 'backfill-dimensions') return backfillDimensions(sharp, true);
  if (STAGE === 'verify') return verify(sharp);
}

main().catch((e) => die(e?.stack || e?.message || String(e)));
