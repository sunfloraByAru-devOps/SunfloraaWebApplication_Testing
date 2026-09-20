/* Home / Today — what needs Aru right now, and what is quietly broken.
 *
 * Two jobs: surface the queues that need working, and surface the problems she
 * cannot see from any single screen (a live product with no photos looks fine
 * in the product list). */

import { route, type ViewCtx } from "../app";
import { getTodayCounts, listProducts } from "../api";
import { findIssues, getPublishState, type Issue } from "../health";
import { h, clear, banner, friendlyError, emptyState, relativeDay } from "../ui";

function tile(label: string, count: number, note: string, href: string) {
  const live = count > 0;
  return h("a", {
    href, class: "a-card",
    style: "text-decoration:none;display:block;" + (live ? "border-color:#EAD4B0;background:#FFFDF8;" : ""),
  }, [
    h("div", {
      style: "font-family:'Playfair Display',Georgia,serif;font-size:2.1rem;line-height:1;" +
             `color:${live ? "var(--a-rose)" : "var(--a-border)"};`,
      text: String(count),
    }),
    h("div", { style: "font-weight:600;color:var(--a-head);margin-top:6px;", text: label }),
    h("div", { class: "a-sub", text: note }),
  ]);
}

function issueRow(issue: Issue) {
  return h("div", { class: "a-rowitem" }, [
    h("span", {
      style: "flex:0 0 auto;font-size:1.1rem;line-height:1;" +
             `color:${issue.severity === "bad" ? "var(--a-err)" : "var(--a-gold)"};`,
      text: issue.severity === "bad" ? "●" : "●",
      "aria-hidden": "true",
    }),
    h("div", { class: "a-rowitem__main" }, [
      h("div", { class: "a-rowitem__name", text: issue.title }),
      h("div", { class: "a-rowitem__meta", text: issue.detail }),
    ]),
    h("a", { class: "a-btn a-btn--ghost a-btn--sm", href: issue.href, text: issue.action }),
  ]);
}

route(/^#\/$/, async (ctx: ViewCtx) => {
  const { root } = ctx;

  let counts, issues: Issue[] = [], productCount = 0, publish;
  try {
    const built = (document.getElementById("admin-root") as HTMLElement)?.dataset.builtAt ?? "";
    [counts, issues, productCount, publish] = await Promise.all([
      getTodayCounts(),
      findIssues().catch(() => [] as Issue[]),
      listProducts().then((p) => p.length).catch(() => 0),
      getPublishState(built).catch(() => null),
    ]);
  } catch (err) {
    clear(root);
    root.appendChild(banner(friendlyError(err, "load your dashboard")));
    return;
  }

  clear(root);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (ctx.session.name || "").split(" ")[0] || "";

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: firstName ? `${greeting}, ${firstName}` : greeting }),
      h("p", { class: "a-sub", text: "Here's what needs you today." }),
    ]),
  ]));

  const queueTotal = counts.newOrders + counts.customRequests + counts.unreadMessages;
  if (queueTotal === 0 && issues.length === 0) {
    root.appendChild(h("div", { class: "a-card" }, [
      emptyState("All caught up", "Nothing is waiting for you right now."),
    ]));
  }

  root.appendChild(h("div", { class: "a-grid a-grid-3" }, [
    tile("Orders to work on", counts.newOrders, "Not yet delivered", "#/orders"),
    tile("Custom requests", counts.customRequests, "Waiting for a reply", "#/custom-orders"),
    tile("Messages", counts.unreadMessages, "Not yet dealt with", "#/messages"),
  ]));

  if (issues.length) {
    root.appendChild(h("h2", { text: "Needs fixing", style: "margin:28px 0 12px;" }));
    const list = h("div", { class: "a-rows" });
    for (const i of issues.slice(0, 10)) list.appendChild(issueRow(i));
    if (issues.length > 10) {
      list.appendChild(h("p", { class: "a-sub", style: "text-align:center;",
        text: `and ${issues.length - 10} more` }));
    }
    root.appendChild(list);
  }

  /* Quiet footer stats — context, not a call to action. */
  root.appendChild(h("h2", { text: "Your shop", style: "margin:28px 0 12px;" }));
  root.appendChild(h("div", { class: "a-grid a-grid-3" }, [
    tile("Products", productCount, "In your shop", "#/products"),
    tile("Reviews waiting", counts.pendingReviews, "Hidden until approved", "#/reviews"),
    tile("Out of stock", counts.outOfStock, "Listed but unavailable", "#/products"),
  ]));

  if (publish) {
    root.appendChild(h("p", { class: "a-hint", style: "margin-top:22px;text-align:center;",
      text: publish.pending
        ? `The live shop was last published ${relativeDay(publish.builtAt).toLowerCase()}. Changes since then aren't public yet.`
        : `Everything you've changed is on the live shop. Last published ${relativeDay(publish.builtAt).toLowerCase()}.` }));
  }
});
