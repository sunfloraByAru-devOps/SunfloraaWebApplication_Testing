#!/usr/bin/env node
/**
 * verify-build.mjs — compare the working-tree `dist/` against the version
 * committed in git and report which pages really changed.
 *
 * Astro rewrites bundle filenames on every build (`app.Bk3f9dQ2.js`), so a
 * naive `git diff` marks nearly every page as changed. This script normalises
 * those content hashes away first, so what is left is genuine content drift.
 *
 * Usage:
 *   node scripts/verify-build.mjs [expected-path ...] [options]
 *
 *   Expected paths are an allowlist of pages that are *supposed* to have real
 *   content differences for the change you just made. Anything else with a
 *   real difference makes the script exit non-zero.
 *
 * Options:
 *   --ref <git-ref>   compare against this ref        (default: HEAD)
 *   --dist <dir>      directory to walk               (default: dist)
 *   --exclude <glob>  skip matching paths, repeatable (default: dist/admin/**)
 *   --context <n>     differing lines to print per page (default: 3)
 *   --strict-new      treat pages absent from the ref as failures
 *   --json            machine-readable output on stdout
 *   --quiet           only print the summary and problems
 *   -h, --help        this text
 *
 * Exit codes: 0 = clean, 1 = unexpected differences, 2 = usage/setup error.
 *
 * Examples:
 *   node scripts/verify-build.mjs dist/productlist/index.html dist/faq/index.html
 *   node scripts/verify-build.mjs --ref origin/main --json
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ASSET_HASH_RE = /\.[A-Za-z0-9_-]{8,10}\.(js|css|png|webp|jpg|svg)/g;

/** Replace content-hash segments in asset filenames with a fixed token. */
const normalise = (html) => html.replace(ASSET_HASH_RE, ".HASH.$1");

/** Git-style path: always forward slashes, no leading "./". */
const toPosix = (p) => p.split(path.sep).join("/").replace(/^\.\//, "");

// ── argv ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    ref: "HEAD",
    dist: "dist",
    exclude: [],
    context: 3,
    strictNew: false,
    json: false,
    quiet: false,
    allow: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = (name) => {
      const v = argv[++i];
      if (v === undefined) fail(`${name} requires a value`);
      return v;
    };
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--ref") opts.ref = need("--ref");
    else if (a === "--dist") opts.dist = need("--dist");
    else if (a === "--exclude") opts.exclude.push(need("--exclude"));
    else if (a === "--context") opts.context = Number(need("--context")) || 0;
    else if (a === "--strict-new") opts.strictNew = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a.startsWith("-")) fail(`unknown option: ${a}`);
    else opts.allow.push(a);
  }
  if (!opts.exclude.length) opts.exclude.push(`${opts.dist}/admin/**`);
  return opts;
}

function fail(msg) {
  process.stderr.write(`verify-build: ${msg}\n`);
  process.exit(2);
}

// ── matching helpers ────────────────────────────────────────────────────────

/** Tiny glob: `*` = within a segment, `**` = across segments. */
function globToRe(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * An allowlist entry matches a file when it is the same path, the same path
 * with the dist prefix or a directory's index.html left off, or a glob that
 * covers it. This keeps `dist/faq/index.html`, `faq/index.html` and `faq`
 * all working, which is what people actually type.
 */
function makeMatcher(entries, dist) {
  const variants = (p) => {
    const f = toPosix(p).replace(/\/+$/, "");
    const set = new Set([f]);
    set.add(`${dist}/${f}`);
    set.add(f.replace(new RegExp(`^${dist}/`), ""));
    for (const v of [...set]) {
      if (!v.endsWith(".html")) {
        set.add(`${v}/index.html`);
        set.add(`${dist}/${v.replace(new RegExp(`^${dist}/`), "")}/index.html`);
      }
    }
    return [...set];
  };
  const compiled = entries.map((e) => ({
    entry: e,
    res: variants(e).map(globToRe),
    hit: false,
  }));
  return {
    match(file) {
      let matched = false;
      for (const c of compiled) {
        if (c.res.some((re) => re.test(file))) {
          c.hit = true;
          matched = true;
        }
      }
      return matched;
    },
    unused: () => compiled.filter((c) => !c.hit).map((c) => c.entry),
  };
}

// ── git access ──────────────────────────────────────────────────────────────

function git(args, opts = {}) {
  return spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
}

function repoRoot() {
  const r = git(["rev-parse", "--show-toplevel"]);
  if (r.status !== 0) fail("not inside a git repository");
  return r.stdout.trim();
}

/** Paths under `dist` that exist in the ref — lets us spot new + deleted pages. */
function listRefFiles(ref, dist) {
  const r = git(["ls-tree", "-r", "--name-only", `${ref}`, "--", dist]);
  if (r.status !== 0) fail(`cannot read ref "${ref}": ${r.stderr.trim()}`);
  return new Set(
    r.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.endsWith(".html")),
  );
}

function showFromRef(ref, file) {
  const r = git(["show", `${ref}:${file}`]);
  return r.status === 0 ? r.stdout : null;
}

// ── walking ─────────────────────────────────────────────────────────────────

function walkHtml(dir, excludeRes) {
  const out = [];
  const visit = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      const rel = toPosix(full);
      if (excludeRes.some((re) => re.test(rel))) continue;
      if (e.isDirectory()) visit(full);
      else if (e.isFile() && e.name.endsWith(".html")) out.push(rel);
    }
  };
  visit(dir);
  return out.sort();
}

// ── diff detail ─────────────────────────────────────────────────────────────

/**
 * First `limit` differing lines between two normalised documents. Astro emits
 * very long lines, so each sample is a window centred on the first character
 * that actually diverges rather than the start of the line — otherwise the
 * "before" and "after" excerpts look identical.
 */
function sampleDiff(oldText, newText, limit, width = 110) {
  if (limit <= 0) return [];
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < limit; i++) {
    if (a[i] === b[i]) continue;
    const la = a[i];
    const lb = b[i];
    if (la === undefined || lb === undefined) {
      out.push({
        line: i + 1,
        col: 1,
        before: la === undefined ? "(line absent)" : la.slice(0, width),
        after: lb === undefined ? "(line absent)" : lb.slice(0, width),
      });
      continue;
    }
    let col = 0;
    while (col < la.length && col < lb.length && la[col] === lb[col]) col++;
    const start = Math.max(0, col - Math.floor(width / 4));
    const window = (s) =>
      (start > 0 ? "…" : "") +
      s.slice(start, start + width) +
      (start + width < s.length ? "…" : "");
    out.push({ line: i + 1, col: col + 1, before: window(la), after: window(lb) });
  }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      fs
        .readFileSync(new URL(import.meta.url), "utf8")
        .split("\n")
        .filter((l) => l.startsWith(" *") || l.startsWith("/**"))
        .map((l) => l.replace(/^\/\*\*| \*\/?/, "").replace(/^ /, ""))
        .join("\n") + "\n",
    );
    return 0;
  }

  const root = repoRoot();
  process.chdir(root);

  if (!fs.existsSync(opts.dist) || !fs.statSync(opts.dist).isDirectory())
    fail(`"${opts.dist}" is not a directory (run a build first)`);

  const excludeRes = opts.exclude.map(globToRe);
  const files = walkHtml(opts.dist, excludeRes);
  if (!files.length) fail(`no .html files found under "${opts.dist}"`);

  const refFiles = listRefFiles(opts.ref, opts.dist);
  const allow = makeMatcher(opts.allow, opts.dist);

  const groups = {
    identical: [],
    hashOnly: [],
    real: [],
    new: [],
    missing: [],
  };

  for (const file of files) {
    const current = fs.readFileSync(file, "utf8");
    const committed = refFiles.has(file) ? showFromRef(opts.ref, file) : null;

    if (committed === null) {
      groups.new.push({ file, allowed: allow.match(file) });
      continue;
    }

    if (committed === current) {
      groups.identical.push({ file, hashChurn: false });
      continue;
    }

    const a = normalise(committed);
    const b = normalise(current);
    if (a === b) {
      // Bytes differ, but only because bundle filenames were re-hashed.
      groups.hashOnly.push({ file });
      continue;
    }

    groups.real.push({
      file,
      allowed: allow.match(file),
      sample: sampleDiff(a, b, opts.context),
    });
  }

  // Pages that exist in the ref but are gone from this build.
  for (const file of refFiles) {
    if (excludeRes.some((re) => re.test(file))) continue;
    if (!fs.existsSync(file))
      groups.missing.push({ file, allowed: allow.match(file) });
  }
  groups.missing.sort((x, y) => x.file.localeCompare(y.file));

  const unexpected = [
    ...groups.real.filter((r) => !r.allowed),
    ...groups.missing.filter((r) => !r.allowed),
    ...(opts.strictNew ? groups.new.filter((r) => !r.allowed) : []),
  ];
  const unusedAllow = allow.unused();
  const code = unexpected.length ? 1 : 0;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ref: opts.ref,
          dist: opts.dist,
          allowlist: opts.allow,
          unusedAllowlist: unusedAllow,
          counts: Object.fromEntries(
            Object.entries(groups).map(([k, v]) => [k, v.length]),
          ),
          groups,
          unexpected: unexpected.map((u) => u.file),
          ok: code === 0,
        },
        null,
        2,
      ) + "\n",
    );
    return code;
  }

  const log = (s = "") => process.stdout.write(`${s}\n`);
  const list = (rows, mark = "  ") =>
    rows.forEach((r) =>
      log(`${mark}${r.file}${r.allowed ? "  (expected)" : ""}`),
    );

  log(`Comparing ${opts.dist}/**/*.html against ${opts.ref}`);
  log(
    `  ${files.length} page(s) walked, ${opts.exclude.length} exclude pattern(s), ` +
      `${opts.allow.length} allowlisted path(s)`,
  );
  log();

  if (!opts.quiet) {
    log(`identical (${groups.identical.length}):`);
    groups.identical.length ? list(groups.identical) : log("  none");
    log();

    log(`differs only in asset hashes (${groups.hashOnly.length}):`);
    groups.hashOnly.length ? list(groups.hashOnly) : log("  none");
    log();
  }

  log(`real content differences (${groups.real.length}):`);
  if (!groups.real.length) log("  none");
  for (const r of groups.real) {
    log(`  ${r.file}${r.allowed ? "  (expected)" : "  <-- UNEXPECTED"}`);
    for (const s of r.sample) {
      log(`      line ${s.line}, col ${s.col}:`);
      log(`        - ${s.before}`);
      log(`        + ${s.after}`);
    }
  }
  log();

  if (groups.new.length) {
    log(`new pages (absent from ${opts.ref}) (${groups.new.length}):`);
    list(groups.new);
    log();
  }
  if (groups.missing.length) {
    log(`missing from build (present in ${opts.ref}) (${groups.missing.length}):`);
    list(groups.missing);
    log();
  }
  if (unusedAllow.length) {
    log(`note: allowlisted but showed no real difference: ${unusedAllow.join(", ")}`);
    log();
  }

  if (code === 0) {
    log("OK — no unexpected content differences.");
  } else {
    log(`FAIL — ${unexpected.length} unexpected page(s):`);
    unexpected.forEach((u) => log(`  ${u.file}`));
  }
  return code;
}

process.exit(main());
