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
chat during initial setup, so both were rotated on 2026-09-20 and the
originals verified dead (token → `Invalid API Token`, hook → HTTP 404). The
Supabase secrets hold the replacements.

If it ever has to happen again, rotate without the values passing through
anything: create the replacements in the dashboard, then run

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^PERSONAL_ACCESS_TOKEN=' .env | cut -d= -f2-)
npx supabase@latest secrets set \
  CF_DEPLOY_HOOK_URL='<new hook>' \
  CF_API_TOKEN='<new token>' \
  --project-ref btmwojmtkeadxdzlfdqi
```

and delete the old ones. `CF_ACCOUNT_ID` and `CF_WORKER_TAG` are not secrets
and do not need rotating.

**These four values belong in exactly one place: the Supabase function secret
store.** Not `.env` — that file feeds `astro build`, and the storefront has no
reason to contact Cloudflare at all. Not `wrangler.jsonc`, which is committed.
Not the Workers Builds environment variables, which is where
`PUBLIC_SUPABASE_*` correctly live and where these do not. The only consumer
is `supabase/functions/publish-site/index.ts`, which reads them with
`Deno.env.get()` at runtime.

There is no way to verify a deploy hook without calling it, and calling it
starts a real build. Check a rotation by confirming the *old* hook returns
404, never by testing that the new one works.

---

## Remaining before the first publish

1. Review and commit the landing-page work (still uncommitted as of writing).
2. `npm run build && npm run preview`, and look at the site — the live copy is
   many commits behind, so the first deploy ships all of it at once.
3. Push to `main`. **That push itself triggers the build and deploy**; the
   Publish button is only a second trigger for the same thing.
4. Then test Publish end to end using §6 above.
