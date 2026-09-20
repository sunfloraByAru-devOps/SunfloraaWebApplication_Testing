/* publish-site
 *
 * Rebuilds and redeploys the storefront when Aru presses Publish.
 *
 * The site is statically rendered: product data, prices and image URLs are
 * baked into the HTML during `astro build`. 08_content_touch.sql already tells
 * her that her edits are not live, but nothing could act on that - every
 * publish was a person running `wrangler deploy` by hand.
 *
 * WHY THIS HAS TO BE A SERVER FUNCTION
 *   A Cloudflare Workers Builds deploy hook is a bare URL that takes no
 *   authorization header. The URL *is* the credential. Anyone who reads it can
 *   trigger paid production deploys forever, so it can never appear in the
 *   browser bundle, in a PUBLIC_ variable, or in a log line. It lives here, as
 *   a secret, behind an admin check.
 *
 * Secrets (supabase secrets set ...):
 *   CF_DEPLOY_HOOK_URL   the hook. Treat as a password.
 *   CF_API_TOKEN         user-scoped: Workers Builds Configuration: Edit,
 *                        Workers Scripts: Read. Used only to read build status.
 *   CF_ACCOUNT_ID        Cloudflare account id.
 *   CF_WORKER_TAG        the Worker whose builds we poll.
 *
 * Deploy: supabase functions deploy publish-site
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/* Deliberately NOT _shared/cors.ts, which allows any origin. That is fine for
   an email sender; this endpoint spends money, so only the shop may call it. */
const ALLOWED_ORIGINS = [
  "https://sunfloracrochet.in",
  "https://www.sunfloracrochet.in",
  "http://localhost:4321",
  "http://localhost:4322",
];

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

/** How long a run may sit in 'building' before we admit we have lost it,
 *  rather than spinning a progress bar at Aru indefinitely. */
const STALE_AFTER_MS = 15 * 60 * 1000;

/** A second press within this window attaches to the running build. */
const DEDUP_WINDOW_MS = 15 * 60 * 1000;

/** Absolute floor between two publishes, so a rapid double-tap cannot burn
 *  two builds. Cloudflare's own already_exists only catches identical pending
 *  builds, which is not the same thing. */
const MIN_GAP_MS = 60 * 1000;

const RUN_COLS =
  "id, requested_at, status, build_uuid, branch, already_existed, finished_at, error";

type Run = {
  id: string;
  requested_at: string;
  status: string;
  build_uuid: string | null;
  branch: string | null;
  already_existed: boolean;
  finished_at: string | null;
  error: string | null;
};

/* Cloudflare's build states, mapped onto the three things the dashboard can
   usefully say. Anything unrecognised is treated as still running rather than
   as a failure - claiming a successful deploy failed is the worse error. */
function mapStatus(cf: string | null | undefined): "building" | "success" | "failed" {
  const s = String(cf ?? "").toLowerCase();
  if (["success", "succeeded", "complete", "completed", "deployed"].includes(s)) return "success";
  if (["failure", "failed", "error", "canceled", "cancelled", "stopped"].includes(s)) return "failed";
  return "building";
}

async function requireAdmin(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  const uid = userData?.user?.id;
  if (!uid) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role").eq("id", uid).maybeSingle();
  return profile?.role === "admin" ? uid : null;
}

async function currentContentStamp(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("site_settings").select("value").eq("key", "content_changed_at").maybeSingle();
  return data?.value ?? null;
}

/* ---------------------------------------------------------------- start */

async function start(req: Request, uid: string) {
  // Attach to a run that is already going rather than queueing another.
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data: inFlight } = await supabaseAdmin
    .from("publish_runs").select(RUN_COLS)
    .in("status", ["queued", "building"])
    .gte("requested_at", since)
    .order("requested_at", { ascending: false })
    .limit(1).maybeSingle();

  if (inFlight) return json(req, { run: { ...inFlight, reused: true } });

  const { data: last } = await supabaseAdmin
    .from("publish_runs").select("requested_at")
    .order("requested_at", { ascending: false })
    .limit(1).maybeSingle();

  if (last && Date.now() - new Date(last.requested_at).getTime() < MIN_GAP_MS) {
    return json(req, { error: "You just published — give it a minute." }, 429);
  }

  const hook = Deno.env.get("CF_DEPLOY_HOOK_URL");
  if (!hook) {
    return json(req, {
      error: "Publishing isn't set up yet. The deploy hook is missing.",
    }, 500);
  }

  const { data: run, error: insErr } = await supabaseAdmin
    .from("publish_runs")
    .insert({
      requested_by: uid,
      status: "queued",
      content_changed_at_at_request: await currentContentStamp(),
    })
    .select(RUN_COLS).single();
  if (insErr) return json(req, { error: "Could not record the publish." }, 500);

  try {
    const res = await fetch(hook, { method: "POST" });
    const text = await res.text();

    if (!res.ok) {
      /* Status and a truncated body only. The URL is the credential, so it must
         never reach a log line or an error message. */
      const detail = `${res.status} ${text.slice(0, 300)}`;
      await supabaseAdmin.from("publish_runs").update({
        status: "failed", finished_at: new Date().toISOString(), error: detail,
      }).eq("id", run.id);
      return json(req, { run: { ...run, status: "failed", error: detail } });
    }

    let payload: any = {};
    try { payload = JSON.parse(text); } catch { /* tolerate a non-JSON 200 */ }
    // Cloudflare wraps most responses in { result: ... }; deploy hooks have
    // been seen both ways, so accept either shape.
    const r = payload?.result ?? payload ?? {};

    const patch = {
      status: "building",
      build_uuid: r.build_uuid ?? null,
      branch: r.branch ?? null,
      worker: r.worker ?? null,
      already_existed: r.already_exists === true,
    };
    const { data: updated } = await supabaseAdmin
      .from("publish_runs").update(patch).eq("id", run.id).select(RUN_COLS).single();

    return json(req, { run: updated ?? { ...run, ...patch } });
  } catch (e) {
    // Never interpolate the hook; a fetch rejection in Deno can carry the URL.
    const detail = `Could not reach Cloudflare: ${String((e as Error)?.name ?? "error")}`;
    await supabaseAdmin.from("publish_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: detail,
    }).eq("id", run.id);
    return json(req, { run: { ...run, status: "failed", error: detail } });
  }
}

/* --------------------------------------------------------------- status */

async function status(req: Request, id: string) {
  const { data: run } = await supabaseAdmin
    .from("publish_runs").select(RUN_COLS).eq("id", id).maybeSingle();
  if (!run) return json(req, { error: "That publish is not on record." }, 404);

  const r = run as Run;
  if (["success", "failed", "unknown", "canceled"].includes(r.status)) {
    return json(req, { run: r });
  }

  const token = Deno.env.get("CF_API_TOKEN");
  const account = Deno.env.get("CF_ACCOUNT_ID");
  const worker = Deno.env.get("CF_WORKER_TAG");

  const age = Date.now() - new Date(r.requested_at).getTime();

  /* Without the read token we cannot tell success from failure. Saying so is
     better than leaving a spinner turning; the build itself is unaffected. */
  if (!token || !account || !worker) {
    if (age > STALE_AFTER_MS) {
      const patch = { status: "unknown", finished_at: new Date().toISOString(),
        error: "Build status reporting isn't configured." };
      await supabaseAdmin.from("publish_runs").update(patch).eq("id", id);
      return json(req, { run: { ...r, ...patch } });
    }
    return json(req, { run: r });
  }

  try {
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${account}/builds/workers/${worker}/builds`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    const builds: any[] = body?.result?.builds ?? body?.result ?? [];

    const match = r.build_uuid
      ? builds.find((b) => (b.build_uuid ?? b.uuid ?? b.id) === r.build_uuid)
      : builds[0];

    if (!match) {
      if (age > STALE_AFTER_MS) {
        const patch = { status: "unknown", finished_at: new Date().toISOString(),
          error: "Cloudflare stopped reporting on this build." };
        await supabaseAdmin.from("publish_runs").update(patch).eq("id", id);
        return json(req, { run: { ...r, ...patch } });
      }
      return json(req, { run: r });
    }

    const mapped = mapStatus(match.status ?? match.build_outcome);
    if (mapped === "building") return json(req, { run: r });

    const patch: Record<string, unknown> = {
      status: mapped,
      finished_at: new Date().toISOString(),
    };
    if (mapped === "failed") {
      patch.error = String(match.status_details ?? match.status ?? "The build failed.").slice(0, 500);
    }
    const { data: updated } = await supabaseAdmin
      .from("publish_runs").update(patch).eq("id", id).select(RUN_COLS).single();
    return json(req, { run: updated ?? { ...r, ...patch } });
  } catch {
    // A failed poll says nothing about the build; leave the run as it is.
    return json(req, { run: r });
  }
}

/* ----------------------------------------------------------------- main */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  try {
    const uid = await requireAdmin(req);
    if (!uid) return json(req, { error: "Not allowed" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "start") return await start(req, uid);
    if (action === "status") {
      if (!body?.id) return json(req, { error: "Which publish?" }, 400);
      return await status(req, String(body.id));
    }
    return json(req, { error: "Unknown action" }, 400);
  } catch {
    return json(req, { error: "Something went wrong starting the publish." }, 500);
  }
});
