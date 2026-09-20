/* Publish — put everything Aru has changed onto the live shop.
 *
 * The storefront is a build-time snapshot: prices, photos and product pages are
 * baked into HTML by `astro build`. Until now nothing could rebuild it, so the
 * dashboard could tell her that her changes were not live and then offer her no
 * way to make them live.
 *
 * Pressing the button calls the publish-site edge function, which holds the
 * Cloudflare deploy hook. It cannot live in this file: the hook takes no
 * authorization header, so the URL itself is the credential and anything in
 * this bundle is public.
 *
 * A publish takes minutes, not seconds, and this screen says so rather than
 * spinning silently — an honest wait is what stops her pressing it again. */

import { route, type ViewCtx } from "../app";
import {
  startPublish, getPublishRun, recentPublishRuns, type PublishRun,
} from "../api";
import { getPublishState } from "../health";
import {
  h, clear, banner, friendlyError, toast, spinner, relativeDay, shortDate,
} from "../ui";

const POLL_MS = 10_000;

/* Cloudflare's build-status API is not usable here: CF_API_TOKEN is rejected
 * (401) and CF_ACCOUNT_ID / CF_WORKER_TAG are 64-character values where
 * Cloudflare uses 32, so every status poll 404s and the run ends as "unknown".
 *
 * The shop itself is a more reliable witness anyway. Every build stamps the
 * dashboard page with data-built-at, and that page is served from this same
 * origin, so fetching it needs no credentials and no CORS exemption. If the
 * stamp on the live copy is newer than the moment we asked to publish, the
 * build finished — whatever Cloudflare will or will not tell us.
 *
 * Returns null when it cannot tell, which the caller treats as "keep waiting"
 * rather than as failure. */
async function liveBuildStamp(): Promise<Date | null> {
  try {
    const res = await fetch(`/admin/?checked=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/data-built-at="([^"]+)"/);
    if (!m) return null;
    const when = new Date(m[1]);
    return isNaN(when.getTime()) ? null : when;
  } catch {
    return null;
  }
}

async function siteRebuiltSince(iso: string): Promise<boolean> {
  const stamp = await liveBuildStamp();
  if (!stamp) return false;
  return stamp.getTime() > new Date(iso).getTime();
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function waitedFor(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 90) return `${secs} seconds ago`;
  return `${Math.round(secs / 60)} minutes ago`;
}

function duration(run: PublishRun): string {
  if (!run.finished_at) return "";
  const ms = new Date(run.finished_at).getTime() - new Date(run.requested_at).getTime();
  if (ms < 0) return "";
  const secs = Math.round(ms / 1000);
  return secs < 90 ? `${secs}s` : `${Math.round(secs / 60)} min`;
}

const OUTCOME: Record<string, string> = {
  queued: "Starting",
  building: "Publishing",
  success: "Published",
  failed: "Failed",
  unknown: "Lost track",
  canceled: "Cancelled",
};

route(/^#\/publish$/, async (ctx: ViewCtx) => {
  const { root } = ctx;

  clear(root);
  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Publish" }),
      h("p", { class: "a-sub",
        text: "Your shop is a snapshot. Publishing rebuilds it with everything you've changed." }),
    ]),
  ]));

  const statusCard = h("div", { class: "a-card" }, [spinner()]);
  const historyCard = h("div", { class: "a-card", style: "margin-top:18px;" });
  root.appendChild(statusCard);
  root.appendChild(historyCard);

  let timer: number | undefined;
  let watching: string | null = null;

  /* The view is replaced on any navigation, so stop polling once this card is
     no longer on the page rather than leaving a timer running forever. */
  const stillMounted = () => document.body.contains(statusCard);
  const stopPolling = () => { window.clearTimeout(timer); timer = undefined; };

  const publishBtn = (label: string, kind = "") =>
    h("button", { class: `a-btn ${kind}`.trim(), text: label }) as HTMLButtonElement;

  const drawIdle = async () => {
    let state;
    try { state = await getPublishState(""); }
    catch (err) {
      clear(statusCard);
      statusCard.appendChild(banner(friendlyError(err, "check whether your changes are live")));
      return;
    }

    if (state.inFlight && state.runId) { void watch(state.runId); return; }

    clear(statusCard);

    const btn = publishBtn(
      state.pending ? "Publish now" : "Publish anyway",
      state.pending ? "" : "a-btn--ghost",
    );

    statusCard.appendChild(h("h2", {
      text: state.pending ? "You have changes that aren't live yet" : "Everything is live",
    }));
    statusCard.appendChild(h("p", {
      class: "a-sub",
      text: state.pending
        ? "Nothing you've changed shows on the shop until you publish."
        : "Everything you've changed is on the shop.",
    }));
    if (state.publishedAt) {
      statusCard.appendChild(h("p", { class: "a-hint",
        text: `Last published ${relativeDay(state.publishedAt).toLowerCase()}.` }));
    }
    statusCard.appendChild(h("div", { style: "margin-top:14px;" }, [btn]));
    statusCard.appendChild(h("p", { class: "a-hint", style: "margin-top:10px;",
      text: "It takes a couple of minutes. You can close this page while it runs." }));

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Starting…";
      try {
        const run = await startPublish();
        if (run.reused) toast("A publish is already running — watching that one.");
        void watch(run.id, run);
      } catch (err: any) {
        btn.disabled = false;
        btn.textContent = state.pending ? "Publish now" : "Publish anyway";
        toast(friendlyError(err, "start publishing"), "err");
      }
    });

    void drawHistory();
  };

  const drawRunning = (run: PublishRun) => {
    clear(statusCard);
    statusCard.appendChild(h("h2", { text: "Publishing…" }));
    statusCard.appendChild(h("p", { class: "a-sub",
      text: `Started ${waitedFor(run.requested_at)}. This usually takes about two minutes.` }));
    statusCard.appendChild(h("p", { class: "a-hint",
      text: "You can close this page — it will keep going." }));
    statusCard.appendChild(h("div", { style: "margin-top:14px;" }, [spinner()]));
  };

  const drawDone = (run: PublishRun) => {
    clear(statusCard);

    if (run.status === "success") {
      statusCard.appendChild(h("h2", { text: "Published" }));
      statusCard.appendChild(h("p", { class: "a-sub", text: "Your changes are live on the shop." }));
      statusCard.appendChild(h("div", { style: "margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;" }, [
        /* This page was itself built from the previous snapshot, so a reload is
           how she gets the new one — without it the old copy stays on screen. */
        h("button", { class: "a-btn", text: "Reload this page",
          onclick: () => location.reload() }),
        h("a", { class: "a-btn a-btn--ghost", href: "/", target: "_blank",
          rel: "noopener", text: "View the shop" }),
      ]));
    } else if (run.status === "unknown") {
      statusCard.appendChild(banner(
        "We lost track of this publish. Check the shop — it may well have worked — " +
        "then try again if it did not.", "warn"));
      statusCard.appendChild(h("div", { style: "margin-top:14px;" }, [retryBtn()]));
    } else {
      statusCard.appendChild(banner(
        run.error
          ? `Couldn't publish: ${run.error}`
          : "Couldn't publish. Nothing has changed on the live shop.", "err"));
      statusCard.appendChild(h("p", { class: "a-hint",
        text: "The shop is still showing the last version that worked." }));
      statusCard.appendChild(h("div", { style: "margin-top:14px;" }, [retryBtn()]));
    }

    void drawHistory();
  };

  const retryBtn = () => {
    const btn = publishBtn("Try again");
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Starting…";
      try {
        const run = await startPublish();
        void watch(run.id, run);
      } catch (err) {
        btn.disabled = false; btn.textContent = "Try again";
        toast(friendlyError(err, "start publishing"), "err");
      }
    });
    return btn;
  };

  const watch = async (id: string, known?: PublishRun) => {
    watching = id;
    let run = known;
    if (!run) {
      try { run = await getPublishRun(id); }
      catch { stopPolling(); void drawIdle(); return; }
    }

    if (run.status === "queued" || run.status === "building") {
      drawRunning(run);
      stopPolling();
      timer = window.setTimeout(async () => {
        if (!stillMounted() || watching !== id) return;

        // Ask the shop first — it knows for certain, and Cloudflare may not.
        if (await siteRebuiltSince(run!.requested_at)) {
          if (!stillMounted() || watching !== id) return;
          stopPolling();
          drawDone({ ...run!, status: "success", finished_at: new Date().toISOString() });
          ctx.refreshBadges();
          return;
        }

        try {
          const next = await getPublishRun(id);
          void watch(id, next);
        } catch {
          // A failed poll says nothing about the build; keep waiting.
          if (stillMounted() && watching === id) void watch(id);
        }
      }, POLL_MS);
      return;
    }

    /* Cloudflare lost track of it — but the shop can still confirm the build
       landed, so check before telling her something went wrong. */
    if (run.status === "unknown" && await siteRebuiltSince(run.requested_at)) {
      run = { ...run, status: "success", finished_at: run.finished_at ?? new Date().toISOString() };
    }

    stopPolling();
    drawDone(run);
    ctx.refreshBadges();
  };

  const drawHistory = async () => {
    let runs: PublishRun[];
    try { runs = await recentPublishRuns(10); }
    catch { historyCard.hidden = true; return; }

    historyCard.hidden = runs.length === 0;
    if (!runs.length) return;

    clear(historyCard);
    historyCard.appendChild(h("h2", { text: "Recent publishes", style: "margin-bottom:12px;" }));
    const list = h("div", { class: "a-rows" });
    for (const r of runs) {
      const d = duration(r);
      list.appendChild(h("div", { class: "a-rowitem" }, [
        h("div", { class: "a-rowitem__main" }, [
          h("div", { class: "a-rowitem__name", text: OUTCOME[r.status] ?? r.status }),
          h("div", { class: "a-rowitem__meta",
            text: `${shortDate(r.requested_at)}${d ? ` · took ${d}` : ""}` +
                  `${r.error ? ` · ${r.error}` : ""}` }),
        ]),
      ]));
    }
    historyCard.appendChild(list);
  };

  void drawIdle();
});
