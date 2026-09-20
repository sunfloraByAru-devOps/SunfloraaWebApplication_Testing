/* Reviews — approve, unapprove, delete. Nothing else is editable. */

import { route, type ViewCtx } from "../app";
import { listReviews, setReviewApproved, deleteReview, listProducts, type Review } from "../api";
import { h, clear, banner, friendlyError, toast, confirmAction, emptyState, relativeDay } from "../ui";

const stars = (n: number) => "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(Math.max(0, 5 - n));

route(/^#\/reviews$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let reviews: Review[], names = new Map<string, string>();
  try {
    const [r, products] = await Promise.all([listReviews(false), listProducts().catch(() => [])]);
    reviews = r;
    products.forEach((p) => names.set(p.id, p.name));
  } catch (err) {
    clear(root); root.appendChild(banner(friendlyError(err, "load the reviews"))); return;
  }

  clear(root);
  const pending = reviews.filter((r) => !r.is_approved);

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Reviews" }),
      h("p", { class: "a-sub", text: pending.length
        ? `${pending.length} waiting for your approval`
        : "Everything has been dealt with" }),
    ]),
  ]));

  const list = h("div", { class: "a-rows" });
  root.appendChild(list);

  const draw = () => {
    clear(list);
    if (!reviews.length) {
      list.appendChild(emptyState("No reviews yet", "Customer reviews will appear here."));
      return;
    }
    // Waiting first — that's what needs her.
    const ordered = [...reviews].sort((a, b) =>
      Number(a.is_approved) - Number(b.is_approved) ||
      (b.created_at || "").localeCompare(a.created_at || ""));

    for (const r of ordered) {
      const card = h("div", { class: "a-card" }, [
        h("div", { style: "display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;" }, [
          h("div", { style: "flex:1;min-width:200px;" }, [
            h("div", { style: "color:var(--a-gold);font-size:1.05rem;letter-spacing:2px;", text: stars(r.stars) }),
            r.title ? h("h3", { text: r.title, style: "margin-top:6px;" }) : null,
            r.body ? h("p", { style: "margin:8px 0 0;white-space:pre-wrap;", text: r.body }) : null,
            h("p", { class: "a-sub", style: "margin-top:10px;", text:
              `${r.guest_name || "A customer"} · ${names.get(r.product_id ?? "") || "Unknown product"} · ${relativeDay(r.created_at)}` }),
          ]),
          h("span", {
            class: "a-pill " + (r.is_approved ? "a-pill--ok" : "a-pill--warn"),
            text: r.is_approved ? "Showing on site" : "Waiting",
          }),
        ]),
        h("div", { style: "display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;" }, [
          h("button", {
            class: r.is_approved ? "a-btn a-btn--ghost a-btn--sm" : "a-btn a-btn--sm",
            text: r.is_approved ? "Hide from site" : "Approve",
            onclick: async (e: Event) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.disabled = true;
              try {
                await setReviewApproved(r.id, !r.is_approved);
                r.is_approved = !r.is_approved;
                toast(r.is_approved ? "Review approved" : "Review hidden");
                ctx.refreshBadges();
                draw();
              } catch (err) { btn.disabled = false; toast(friendlyError(err, "update that review"), "err"); }
            },
          }),
          h("button", {
            class: "a-btn a-btn--danger a-btn--sm", text: "Delete",
            onclick: async () => {
              if (!await confirmAction("Delete this review for good? This cannot be undone.", "Delete review")) return;
              try {
                await deleteReview(r.id);
                reviews = reviews.filter((x) => x.id !== r.id);
                toast("Review deleted"); ctx.refreshBadges(); draw();
              } catch (err) { toast(friendlyError(err, "delete that review"), "err"); }
            },
          }),
        ]),
      ]);
      list.appendChild(card);
    }
  };
  draw();
});
