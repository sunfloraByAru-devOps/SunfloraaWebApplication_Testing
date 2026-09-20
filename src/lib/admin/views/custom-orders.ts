/* Custom orders — the bespoke request queue.
   What needs a reply is put first and marked, because that's the whole job. */

import { route, type ViewCtx } from "../app";
import {
  listCustomOrders, getCustomOrder, setCustomOrderStatus, inspirationUrl,
  CUSTOM_STATUSES, CUSTOM_STATUS_LABEL, CUSTOM_NEEDS_REPLY, type CustomOrder,
} from "../api";
import {
  h, clear, banner, friendlyError, rupees, relativeDay, shortDate, toast,
  emptyState, field, confirmAction,
} from "../ui";

const pill = (s: string) => h("span", {
  class: "a-pill " + (s === "delivered" ? "a-pill--ok"
    : s === "cancelled" ? "a-pill--err"
    : CUSTOM_NEEDS_REPLY.includes(s) ? "a-pill--warn" : ""),
  text: CUSTOM_STATUS_LABEL[s] ?? s,
});

route(/^#\/custom-orders$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let requests: CustomOrder[];
  try { requests = await listCustomOrders(); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "load the custom requests"))); return; }

  clear(root);
  const waiting = requests.filter((r) => CUSTOM_NEEDS_REPLY.includes(r.status));

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Custom requests" }),
      h("p", { class: "a-sub", text: waiting.length
        ? `${waiting.length} waiting for you to reply`
        : "Nothing waiting for a reply" }),
    ]),
  ]));

  if (!requests.length) {
    root.appendChild(emptyState("No requests yet",
      "When someone asks for something bespoke on the website, it lands here."));
    return;
  }

  // Needs-a-reply first, then newest.
  const ordered = [...requests].sort((a, b) =>
    Number(CUSTOM_NEEDS_REPLY.includes(b.status)) - Number(CUSTOM_NEEDS_REPLY.includes(a.status)) ||
    (b.created_at || "").localeCompare(a.created_at || ""));

  const list = h("div", { class: "a-rows" });
  for (const r of ordered) {
    const needs = CUSTOM_NEEDS_REPLY.includes(r.status);
    list.appendChild(h("a", {
      class: "a-rowitem", href: `#/custom-orders/${r.id}`,
      style: "text-decoration:none;color:inherit;" + (needs ? "border-color:#EAD4B0;background:#FFFDF8;" : ""),
    }, [
      h("div", { class: "a-rowitem__main" }, [
        h("div", { class: "a-rowitem__name", text: r.creation_name }),
        h("div", { class: "a-rowitem__meta",
          text: `${r.size_label} · ${r.ref_number} · ${relativeDay(r.created_at)}` }),
      ]),
      h("div", { class: "a-rowitem__actions" }, [
        r.quoted_price ? h("strong", { text: rupees(r.quoted_price), style: "color:var(--a-head);" }) : null,
        pill(r.status),
      ]),
    ]));
  }
  root.appendChild(list);
});

route(/^#\/custom-orders\/([0-9a-fA-F-]{36})$/, async (ctx: ViewCtx, params) => {
  const { root } = ctx;
  const id = params[0];
  let data;
  try { data = await getCustomOrder(id); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "open that request"))); return; }

  const r = data.request;
  clear(root);

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: r.creation_name }),
      h("p", { class: "a-sub", text: `${r.ref_number} · asked ${shortDate(r.created_at)}` }),
    ]),
    pill(r.status),
    h("a", { class: "a-btn a-btn--quiet a-btn--sm", href: "#/custom-orders", text: "← All requests" }),
  ]));

  /* what they asked for */
  const detail = h("div", { class: "a-card" }, [
    h("h2", { text: "What they asked for", style: "margin-bottom:12px;" }),
    h("p", { style: "margin:0 0 6px;" }, [h("strong", { text: "Size: " }), document.createTextNode(r.size_label || "—")]),
    r.description
      ? h("p", { style: "white-space:pre-wrap;margin:12px 0 0;", text: r.description })
      : h("p", { class: "a-sub", text: "They didn't add a description." }),
  ]);

  /* the inspiration image lives in a private bucket — render it, never the path */
  if (r.inspiration_path) {
    const slot = h("div", { style: "margin-top:14px;" }, [
      h("p", { class: "a-sub", text: "Loading their picture…" }),
    ]);
    detail.appendChild(slot);
    inspirationUrl(r.inspiration_path).then((url) => {
      clear(slot);
      slot.appendChild(url
        ? h("img", { src: url, alt: "Their inspiration picture", loading: "lazy",
            style: "max-width:100%;border-radius:12px;border:1px solid var(--a-border);" })
        : h("p", { class: "a-sub", text: "Their picture could not be loaded." }));
    });
  }
  root.appendChild(detail);

  /* how to reach them */
  root.appendChild(h("div", { class: "a-card" }, [
    h("h2", { text: "How to reach them", style: "margin-bottom:12px;" }),
    h("p", { style: "margin:0;" }, [
      h("a", { href: `mailto:${r.email}`, style: "color:var(--a-rose);", text: r.email }),
    ]),
    r.phone ? h("p", { style: "margin:4px 0 0;" }, [
      h("a", { href: `tel:${r.phone}`, style: "color:var(--a-rose);", text: r.phone }),
    ]) : null,
  ]));

  /* move it along */
  const statusSel = h("select", { class: "a-select" }) as HTMLSelectElement;
  for (const s of CUSTOM_STATUSES) {
    const o = h("option", { value: s, text: CUSTOM_STATUS_LABEL[s] ?? s }) as HTMLOptionElement;
    if (s === r.status) o.selected = true;
    statusSel.appendChild(o);
  }
  const quote = h("input", { class: "a-input", type: "number", min: "0", step: "1",
    value: r.quoted_price ?? "", placeholder: "e.g. 1499" }) as HTMLInputElement;
  const note = h("input", { class: "a-input",
    placeholder: "Anything you want them to know" }) as HTMLInputElement;
  const priv = h("textarea", { class: "a-textarea", placeholder: "Only you can see this." }) as HTMLTextAreaElement;
  priv.value = r.admin_notes ?? "";

  root.appendChild(h("div", { class: "a-card" }, [
    h("h2", { text: "Moving it along", style: "margin-bottom:14px;" }),
    h("div", { class: "a-banner a-banner--warn" },
      [document.createTextNode("Changing where it's up to emails the customer, including your message below.")]),
    field("Where it's up to", statusSel),
    field("Price you're quoting", quote, "Leave blank if you're not quoting yet."),
    field("Message to the customer", note, "This goes in their email."),
    field("Private note", priv, "For you only — they never see this."),
    h("button", {
      class: "a-btn", text: "Save and let them know",
      onclick: async (e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const changing = statusSel.value !== r.status;
        if (changing && !await confirmAction(
          `Move this to “${CUSTOM_STATUS_LABEL[statusSel.value]}” and email the customer?`,
          "Yes, update and email")) return;
        btn.disabled = true; btn.textContent = "Saving…";
        try {
          await setCustomOrderStatus(id, statusSel.value, {
            note: note.value.trim() || null,
            quotedPrice: quote.value === "" ? null : Number(quote.value),
            adminNotes: priv.value.trim() || null,
          });
          toast(changing ? "Updated and the customer has been emailed" : "Saved");
          ctx.refreshBadges();
          location.reload();
        } catch (err) {
          btn.disabled = false; btn.textContent = "Save and let them know";
          toast(friendlyError(err, "update this request"), "err");
        }
      },
    }),
  ]));

  /* timeline */
  const tl = h("div", { class: "a-card" }, [h("h2", { text: "What's happened", style: "margin-bottom:12px;" })]);
  if (!data.history.length) tl.appendChild(h("p", { class: "a-sub", text: "Nothing recorded yet." }));
  for (const ev of data.history) {
    tl.appendChild(h("div", { style: "padding:10px 0;border-bottom:1px solid var(--a-border);" }, [
      h("div", { style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap;" }, [
        pill(ev.status), h("span", { class: "a-sub", text: relativeDay(ev.created_at) }),
      ]),
      ev.note ? h("p", { style: "margin:6px 0 0;", text: ev.note }) : null,
    ]));
  }
  root.appendChild(tl);
});
