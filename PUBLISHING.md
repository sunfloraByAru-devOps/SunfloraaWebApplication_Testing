# Publishing

The storefront is statically rendered. Prices, photos and product pages are
baked into HTML by `astro build`, so **nothing Aru changes in the dashboard is
live until the site is rebuilt**. The dashboard has a Publish button that does
this; the steps below are what make that button work.

Until they are done, the button will report *"Publishing isn't set up yet."*
and nothing else in the dashboard is affected.

---

## Status as of 2026-09-20

Everything below was read back from the Cloudflare API, not assumed.

**The live site is Worker `sunfloraaweb` on account
`e484cc708781e70da1773b70f4acc2a0` (Sunflorabyaru@gmail.com).** The custom
domain mapping is the source of truth: `sunfloracrochet.in -> sunfloraaweb
(production)`. There is a second, stale Worker called `sunflora` on the same
account, last touched 2026-05-30, with no domain attached — `wrangler.jsonc`
used to name *that* one.

| Piece | State |
|---|---|
| Database schema + seed | done, verified |
| `publish-site` edge function | deployed, auth-gated (anon → 403, no-auth → 403) |
| `CF_DEPLOY_HOOK_URL` / `CF_API_TOKEN` / `CF_ACCOUNT_ID` / `CF_WORKER_TAG` | all four set |
| GitHub repo connected to Workers Builds | yes — `sunfloraByAru-devOps/SunfloraaWebApplication_Testing` |
| Build + deploy command, root dir | `npm run build`, `npx wrangler deploy`, `/` |
| Build caching | enabled |
| `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_KEY` build vars | set |
| Node version | pinned here via `.nvmrc` (22.12.0), since `package.json` needs >= 22.12 |
| Builds run so far | none |

### Three things still wrong

1. **`wrangler.jsonc` named the wrong Worker.** Fixed in this repo
   (`sunflora` → `sunfloraaweb`) but **not yet committed or pushed**, so a
   build today would still deploy to the dead Worker: a publish that reports
   success and changes nothing on the live site.

2. **The stale `SESSION` KV binding is gone from `wrangler.jsonc`.** The live
   Worker has an empty binding list and nothing in `src/` used it. Left in, a
   binding whose namespace does not exist on this account fails the deploy —
   and it would have surfaced as "Publish is broken".

3. ~~Two different branches are in play.~~ **Resolved 2026-09-20:** the build
   configuration was on `sep` and the deploy hook on `main`. Both are now
   `main`. Everything else in the configuration was preserved — verified by
   reading it back.

### Consequence of choosing `main`

**A push to `main` now builds and deploys to the live site automatically.**
That is what connecting Workers Builds to `main` means; the Publish button is
just a second way to trigger the same thing. There is no staging step between
a merge and customers seeing it.

If that turns out to be too loose, the fix is a `production` branch: point the
hook and the build configuration at it, and merge `main -> production` to
release. Nothing else has to change.

### Do not fire the hook until the work is committed AND pushed

Until then a build checks out a `main` that still has the old
`wrangler.jsonc`, and deploys to the dead `sunflora` Worker — a publish that
reports success and changes nothing.

And note what the first real publish does: the live site is many commits
behind, so it ships **everything** since that old deploy at once — the admin
panel, the structured-data work, and the landing page rewrite. Run
`npm run build && npm run preview` and look at it first.

### Credential hygiene

The deploy hook URL and the Workers Builds API token were both shared over
chat during setup. Both are bearer credentials; the token carries write scope.
Delete and recreate both in the dashboard, then re-run the `supabase secrets
set` in §5 with the new values.

---

## 0. The account the site is on

Checked on 2026-09-20, and this did not line up:

- `wrangler whoami` is logged in as **sledjesoftwares@gmail.com**, account
  `29f075d1bc8d2e984d905f5d3722f7bc`.
- That account has **no Worker named `sunflora`** (`wrangler deployments list
  --name sunflora` → *"This Worker does not exist on your account"*) and **no
  Pages projects at all**.
- Yet `https://sunfloracrochet.in` is live and served by Cloudflare.
- The live copy is **well behind `main`**: it serves zero structured data,
  which commit `448ea2a` added, and `/admin/` 404s.

So the thing serving the live site is on some *other* Cloudflare account, or
through some other setup, and `wrangler.jsonc` describes a Worker that has
never been deployed from here.

**Resolved:** the live site is on a different Cloudflare account, and the
deploy hook now stored in Supabase belongs to that account. All dashboard work
(§1, §3, §4) happens there. `wrangler` on this machine is still logged into
`sledjesoftwares@gmail.com`, so a local `npm run deploy` would create a
*different*, unrelated Worker — don't run it against production expectations
without switching accounts first.

If you ever need to revisit the choice:

- If the live site is on another Cloudflare account, do all of the following
  **while logged into that account** (`wrangler logout && wrangler login`), and
  use that account's ID in §4.
- If nobody has access to it any more, deploy fresh from this account
  (`npm run deploy` creates the `sunflora` Worker) and then repoint the
  `sunfloracrochet.in` DNS record at it. Do that deliberately — it is a
  cutover, not a config tweak.

Whichever it is, **the Worker must exist and be serving the domain before a
deploy hook means anything.** A hook pointed at a Worker nobody visits will
build happily and change nothing.

---

## 1. Connect the repo to Workers Builds

Cloudflare dashboard → **Workers & Pages → `sunflora` → Settings → Builds**.

Install the Workers Builds GitHub App on
`sunfloraByAru-devOps/SunfloraaWebApplication_Testing` and connect it.

> Installing the app needs a GitHub **organisation owner**. Start this first —
> it is the step most likely to sit waiting on someone else.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Branch | `production` (see §2) |

Build caching: **on**. Astro keeps its optimized-image cache in
`node_modules/.astro`. Measured locally: **27s cold, 20s warm** against a 19s
pre-change baseline — so with the cache the image work is nearly free, and
without it every publish re-downloads and re-encodes all ~66 image variants.
That gap grows with the catalog.

### Build environment variables

```
PUBLIC_SUPABASE_URL     same value as .env
PUBLIC_SUPABASE_KEY     same value as .env
NODE_VERSION            22
```

`PUBLIC_SUPABASE_*` are **required**. `src/lib/site-content.ts` throws rather
than shipping an empty FAQ page or an empty home page, so a build without them
fails loudly and immediately — which is the intended behaviour, not a bug.

`NODE_VERSION` matters because `package.json` requires `>=22.12.0`.

---

## 2. Use a `production` branch, not `main`

A deploy hook rebuilds **whatever is at the head of its branch**. If the hook
points at `main`, Aru pressing Publish to correct a price also ships whatever
anyone happened to push to `main` that day. There are `sep` and `v2` branches
in this repo, so this is not hypothetical.

```bash
git switch -c production
git push -u origin production
```

From then on, merging into `production` is the release gesture. Publish only
ever re-renders current content against code that was deliberately released.

---

## 3. Create the deploy hook

Cloudflare dashboard → **Workers & Pages → `sunflora` → Settings → Builds →
Deploy Hooks**. Name it something like `dashboard-publish`, target the
`production` branch, and copy the URL.

```
https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/<DEPLOY_HOOK_ID>
```

> **Treat this URL as a password.** It takes no authorization header — the URL
> *is* the credential. Anyone who has it can trigger production deploys
> indefinitely. It must never appear in a `PUBLIC_` variable, in the browser
> bundle, in a commit, or in a log line. If it leaks, delete the hook and
> create a new one; the old URL stops working immediately.

Cloudflare rate-limits deploy hooks to 10 builds/min per Worker.

---

## 4. Create a read-only API token for build status

The hook starts a build but tells you nothing about how it went. To show
"Published" or "Couldn't publish" rather than an endless spinner, the function
reads the builds API.

Cloudflare dashboard → **My Profile → API Tokens → Create Token**, custom
token with exactly:

- **Workers Builds Configuration** — Edit
- **Workers Scripts** — Read

Note your **Account ID** and the **Worker name** (`sunflora`) too. For the
currently logged-in account that ID is `29f075d1bc8d2e984d905f5d3722f7bc` —
but see §0: that may not be the account you want.

Without this token, publishing still works — the dashboard just says it lost
track of the build after 15 minutes instead of reporting the outcome.

---

## 5. Deploy the edge function and set its secrets

```bash
supabase functions deploy publish-site

supabase secrets set \
  CF_DEPLOY_HOOK_URL='https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/...' \
  CF_API_TOKEN='...' \
  CF_ACCOUNT_ID='...' \
  CF_WORKER_TAG='sunflora'
```

All four are server-side only. None of them may ever become a `PUBLIC_`
variable.

> **Unrelated discrepancy worth checking while you are here.**
> `supabase/functions/send-order-revision/index.ts` imports
> `./_shared/cors.ts` and `./_shared/supabaseAdmin.ts`. Relative to that file
> those resolve to `send-order-revision/_shared/…`, which does not exist —
> the shared modules live one level up, at `supabase/functions/_shared/`.
> So the copy running in production cannot be the copy in this repo.
> `publish-site` uses the correct `../_shared/…` and deploys cleanly.
> Re-deploying `send-order-revision` from the repo as-is would likely fail,
> or ship something different from what is live. Worth reconciling before
> anyone touches order-revision emails.

The function checks `profiles.role = 'admin'` on the caller's JWT before doing
anything, and writes `publish_runs` with the service role — the browser has
read-only access to that table, deliberately, so a client cannot fabricate a
successful publish.

---

## 6. Prove it before handing it over

1. **Build without the hook first.** Push to `production` and watch Workers
   Builds run. This proves the environment variables are right *before* the
   button exists to blame.
2. **First real Publish.** Watch the Cloudflare build log and the
   `publish_runs` row together. Time it, and put the real number into the
   "usually takes about two minutes" copy in
   `src/lib/admin/views/publish.ts`.
3. **Double-tap the button.** Expect one build and "a publish is already
   running", not two builds.
4. **Break it on purpose.** Temporarily clear `PUBLIC_SUPABASE_KEY` in the
   Workers Builds environment and publish. The dashboard must reach *Failed*
   with a readable reason rather than spinning. Restore it.
5. **End to end.** Change a category's "Shown as" in the dashboard, confirm the
   amber banner appears, Publish, wait for success, reload the dashboard and
   confirm **the banner clears**. Then hard-reload the shop and confirm the new
   label, and click the card to confirm it lands on the right filtered shelf.

---

## Rolling back

Workers keeps version history. If a publish ships something broken:

```bash
npx wrangler rollback
```

A failed *build* never reaches the live site at all — Cloudflare only deploys
on success, so the previous version keeps serving.

---

## Local builds and deploys

`dist/` is no longer tracked in git; Workers Builds produces it from source.
A bare `wrangler deploy` would therefore ship whatever stale `dist/` happens
to be on disk, with git showing nothing wrong. Use:

```bash
npm run deploy     # astro build && wrangler deploy
```

Better still, once Workers Builds is connected, let it be the only thing that
deploys.

`scripts/verify-build.mjs` used the committed `dist/` as its baseline. It now
takes a directory instead:

```bash
npm run build && cp -r dist /tmp/before
# ...make a change...
npm run build
node scripts/verify-build.mjs --baseline-dir /tmp/before dist/index.html
```

---

## What happens on every publish

1. Cloudflare checks out `production` and runs `npm run build`.
2. Astro queries Supabase for products, categories, FAQs, site images and the
   two home page carousels.
3. Every remote image is downloaded and re-encoded into hashed, same-origin
   AVIF/WebP with `srcset` — which is why the pictures stay fast and the
   layout does not shift, even though Aru uploads them from her phone.
4. `npx wrangler deploy` uploads `dist/`.

Measured on the home page when this landed: image weight went from **19.8 MB
across 24 images (3 of them 404ing) to 1.6 MB across 22** — 92% smaller — and
every remaining image now carries `width`, `height` and a `srcset`, so nothing
shifts as the page loads.

Step 3 is also why a **deleted image fails the build** rather than leaving a
gap. The dashboard's Today screen flags any home page picture that has gone
missing, so this should be caught before anyone presses Publish.
