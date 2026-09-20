/* Orders — find one, see what was bought and where it ships, move it through
   its statuses, and revise the items when something has to change.

   Contact details and the delivery address appear only here, on the one screen
   that needs them - never in the list. */

import { route, type ViewCtx } from "../app";
import {
  listOrders, getOrder, changeOrderStatus, saveOrderFulfilment, reviseOrder,
  ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL,
  type OrderSummary, type OrderItem,
} from "../api";
import {
  h, clear, banner, friendlyError, rupees, shortDate, relativeDay, toast,
  confirmAction, emptyState, field,
} from "../ui";

const statusPill = (s: string) => {
  const kind = s === "delivered" ? "a-pill--ok"
    : s === "cancelled" ? "a-pill--err"
    : s === "pending" ? "a-pill--warn" : "";
  return h("span", { class: `a-pill ${kind}`, text: ORDER_STATUS_LABEL[s] ?? s });
};

/* ---------------- list ---------------- */

route(/^#\/orders$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let orders: OrderSummary[];
  try { orders = await listOrders(); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "load your orders"))); return; }

  clear(root);

  const search = h("input", { class: "a-input", type: "search",
    placeholder: "Order number or customer…", style: "max-width:240px;" }) as HTMLInputElement;
  const filter = h("select", { class: "a-select", style: "max-width:190px;" }) as HTMLSelectElement;
  filter.appendChild(h("option", { value: "", text: "All orders" }));
  for (const s of ORDER_STATUSES) {
    filter.appendChild(h("option", { value: s, text: ORDER_STATUS_LABEL[s] ?? s }));
  }

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Orders" }),
      h("p", { class: "a-sub", text: `${orders.length} in total, newest first` }),
    ]),
    search, filter,
  ]));

  const list = h("div", { class: "a-rows" });
  root.appendChild(list);

  const draw = () => {
    clear(list);
    const q = search.value.trim().toLowerCase();
    const st = filter.value;
    const shown = orders.filter((o) =>
      (!st || o.status === st) &&
      (!q || (o.order_number || "").toLowerCase().includes(q) ||
             (o.guest_name || "").toLowerCase().includes(q)));

    if (!shown.length) {
      list.appendChild(emptyState("Nothing here", q || st
        ? "No order matches what you're looking for."
        : "Orders will appear here as customers place them."));
      return;
    }

    for (const o of shown) {
      list.appendChild(h("a", { class: "a-rowitem", href: `#/orders/${o.id}`,
        style: "text-decoration:none;color:inherit;" }, [
        h("div", { class: "a-rowitem__main" }, [
          h("div", { class: "a-rowitem__name", text: o.order_number || "Order" }),
          h("div", { class: "a-rowitem__meta",
            text: `${o.guest_name || "Customer"} · ${relativeDay(o.created_at)}` }),
        ]),
        h("div", { class: "a-rowitem__actions" }, [
          h("strong", { text: rupees(o.total), style: "color:var(--a-head);" }),
          statusPill(o.status),
        ]),
      ]));
    }
  };
  draw();
  search.addEventListener("input", draw);
  filter.addEventListener("change", draw);
});

/* ---------------- item editor ---------------- */

function itemEditor(items: OrderItem[], onDirty: () => void) {
  const state = items.map((i) => ({
    id: i.id, product_name: i.product_name ?? "", quantity: Number(i.quantity ?? 1),
    unit_price: Number(i.unit_price ?? 0), size_label: i.size_label, color_name: i.color_name,
  }));
  const body = h("div");
  const totalLine = h("p", { class: "a-sub", style: "text-align:right;font-weight:600;" });

  const recalc = () => {
    const sum = state.reduce((t, r) => t + r.quantity * r.unit_price, 0);
    totalLine.textContent = `Items come to ${rupees(sum)}`;
    onDirty();
  };

  const draw = () => {
    clear(body);
    state.forEach((row, i) => {
      const name = h("input", { class: "a-input", value: row.product_name,
        placeholder: "Item name", "aria-label": "Item name" }) as HTMLInputElement;
      const qty = h("input", { class: "a-input", type: "number", min: "1", step: "1",
        value: String(row.quantity), "aria-label": "Quantity" }) as HTMLInputElement;
      const price = h("input", { class: "a-input", type: "number", min: "0", step: "1",
        value: String(row.unit_price), "aria-label": "Price each" }) as HTMLInputElement;

      name.addEventListener("input", () => { row.product_name = name.value; recalc(); });
      qty.addEventListener("input", () => { row.quantity = Math.max(1, Number(qty.value) || 1); recalc(); });
      price.addEventListener("input", () => { row.unit_price = Math.max(0, Number(price.value) || 0); recalc(); });

      body.appendChild(h("div", { class: "a-row", style: "align-items:flex-end;margin-bottom:10px;" }, [
        h("div", { style: "flex:3 1 200px;" }, [
          h("label", { class: "a-label", text: i === 0 ? "Item" : "", style: i === 0 ? "" : "display:none;" }),
          name,
        ]),
        h("div", { style: "flex:0 1 90px;" }, [
          h("label", { class: "a-label", text: i === 0 ? "Qty" : "", style: i === 0 ? "" : "display:none;" }),
          qty,
        ]),
        h("div", { style: "flex:0 1 120px;" }, [
          h("label", { class: "a-label", text: i === 0 ? "Price each" : "", style: i === 0 ? "" : "display:none;" }),
          price,
        ]),
        h("button", { type: "button", class: "a-btn a-btn--danger a-btn--sm", text: "Remove",
          style: "flex:0 0 auto;",
          onclick: () => {
            if (state.length === 1) { toast("An order must keep at least one item.", "err"); return; }
            state.splice(i, 1); draw(); recalc();
          } }),
      ]));
    });
    body.appendChild(h("button", {
      type: "button", class: "a-btn a-btn--ghost a-btn--sm", text: "+ Add an item",
      onclick: () => { state.push({ id: null as any, product_name: "", quantity: 1, unit_price: 0,
        size_label: null, color_name: null }); draw(); recalc(); },
    }));
    body.appendChild(totalLine);
  };
  draw(); recalc();

  return {
    el: body,
    value: () => state
      .filter((r) => r.product_name.trim() !== "")
      .map((r) => ({
        id: r.id || undefined, product_name: r.product_name.trim(),
        quantity: r.quantity, unit_price: r.unit_price,
        size_label: r.size_label, color_name: r.color_name,
      })),
  };
}

/* ---------------- detail ---------------- */

route(/^#\/orders\/([0-9a-fA-F-]{36})$/, async (ctx: ViewCtx, params) => {
  const { root } = ctx;
  const id = params[0];
  let d;
  try { d = await getOrder(id); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "open that order"))); return; }

  const { order, items, history, address, notifications } = d;
  clear(root);

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: order.order_number || "Order" }),
      h("p", { class: "a-sub", text: `Placed ${shortDate(order.created_at)}` }),
    ]),
    statusPill(order.status),
    h("a", { class: "a-btn a-btn--quiet a-btn--sm", href: "#/orders", text: "← All orders" }),
  ]));

  const msgs = h("div");
  root.appendChild(msgs);

  /* ----- items ----- */
  const itemsCard = h("div", { class: "a-card" });
  const itemsBody = h("div");

  const renderReadOnly = () => {
    clear(itemsBody);
    const table = h("table", { class: "a-table" });
    for (const i of items) {
      table.appendChild(h("tr", {}, [
        h("td", {}, [
          h("div", { text: i.product_name || "Item", style: "font-weight:600;color:var(--a-head);" }),
          i.size_label || i.color_name
            ? h("div", { class: "a-sub", text: [i.size_label, i.color_name].filter(Boolean).join(" · ") })
            : null,
        ]),
        h("td", { text: `× ${i.quantity}`, style: "white-space:nowrap;" }),
        h("td", { text: rupees(i.quantity * i.unit_price), style: "text-align:right;white-space:nowrap;" }),
      ]));
    }
    const row = (label: string, value: string, strong = false) => h("tr", {}, [
      h("td", { colspan: "2", text: label, style: strong ? "font-weight:700;color:var(--a-head);" : "" }),
      h("td", { text: value, style: "text-align:right;" + (strong ? "font-weight:700;color:var(--a-head);" : "") }),
    ]);
    table.appendChild(row("Items", rupees(order.subtotal)));
    table.appendChild(row("Delivery", rupees(order.shipping_fee)));
    if (Number(order.discount) > 0) table.appendChild(row("Discount", "−" + rupees(order.discount)));
    table.appendChild(row("Total", rupees(order.total), true));

    itemsBody.appendChild(h("div", { class: "a-scroll-x" }, [table]));
    itemsBody.appendChild(h("button", {
      class: "a-btn a-btn--ghost a-btn--sm", text: "Change these items",
      style: "margin-top:14px;", onclick: renderEdit,
    }));
  };

  const renderEdit = () => {
    clear(itemsBody);
    itemsBody.appendChild(h("div", { class: "a-banner a-banner--warn" },
      [document.createTextNode(
        "This order has already been placed. If you change it, the customer is emailed " +
        "straight away with the new items and the new total.")]));

    let dirty = false;
    const editor = itemEditor(items, () => { dirty = true; });
    itemsBody.appendChild(editor.el);

    const reason = h("textarea", { class: "a-textarea",
      placeholder: "e.g. The large size was out of stock, so we've swapped it for the medium.",
      style: "min-height:80px;" }) as HTMLTextAreaElement;
    itemsBody.appendChild(field("Why is it changing?", reason,
      "This goes in the email to the customer, so write it for them."));

    const save = h("button", { class: "a-btn", text: "Save and email the customer" }) as HTMLButtonElement;
    save.addEventListener("click", async () => {
      const next = editor.value();
      if (!next.length) { toast("An order must keep at least one item.", "err"); return; }
      if (!reason.value.trim()) {
        toast("Please say why it's changing — the customer will see it.", "err");
        reason.focus(); return;
      }
      if (!await confirmAction(
        "Change this order and email the customer about it? The new total will replace the old one.",
        "Change it and email")) return;

      save.disabled = true; save.textContent = "Saving…";
      try {
        const res = await reviseOrder(id, next, reason.value.trim());
        if (res.emailProblem === "queued") {
          toast("Order updated. The email hasn't gone yet — it will send on the next try.", "err");
        } else if (res.emailProblem === "failed") {
          toast("Order updated, but the email could not be delivered. Check the address.", "err");
        } else if (res.emailSent) {
          toast("Order updated and the customer has been emailed");
        } else {
          toast("Order updated. No email address on this order, so nobody was told.", "err");
        }
        location.reload();
      } catch (err) {
        save.disabled = false; save.textContent = "Save and email the customer";
        msgs.appendChild(banner(friendlyError(err, "change this order")));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    itemsBody.appendChild(h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;" }, [
      save,
      h("button", { class: "a-btn a-btn--ghost", text: "Cancel",
        onclick: async () => {
          if (dirty && !await confirmAction("Discard your changes to these items?", "Discard")) return;
          renderReadOnly();
        } }),
    ]));
  };

  itemsCard.appendChild(h("h2", { text: "What was ordered", style: "margin-bottom:14px;" }));
  itemsCard.appendChild(itemsBody);
  renderReadOnly();
  root.appendChild(itemsCard);

  /* ----- where it goes ----- */
  const contact: (Node | null)[] = [];
  if (order.guest_name) contact.push(h("p", { style: "margin:0;", text: order.guest_name }));
  if (d.customerEmail) contact.push(h("p", { style: "margin:0;", text: d.customerEmail }));
  if (address) {
    contact.push(h("p", { style: "margin:8px 0 0;white-space:pre-line;", text:
      [address.line1, address.line2, address.city, address.state, address.pincode, address.country]
        .filter(Boolean).join("\n") }));
  }
  root.appendChild(h("div", { class: "a-card" }, [
    h("h2", { text: "Where it goes", style: "margin-bottom:12px;" }),
    contact.length ? h("div", {}, contact)
      : h("p", { class: "a-sub", text: "No delivery details were saved with this order." }),
    h("p", { class: "a-sub", style: "margin-top:12px;",
      text: `Payment: ${PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status ?? "unknown"}` +
            (order.payment_method ? ` · ${order.payment_method}` : "") }),
  ]));

  /* ----- fulfilment ----- */
  const statusSel = h("select", { class: "a-select" }) as HTMLSelectElement;
  for (const s of ORDER_STATUSES) {
    const o = h("option", { value: s, text: ORDER_STATUS_LABEL[s] ?? s }) as HTMLOptionElement;
    if (s === order.status) o.selected = true;
    statusSel.appendChild(o);
  }
  const statusNote = h("input", { class: "a-input", placeholder: "Optional note for your records" }) as HTMLInputElement;
  const tracking = h("input", { class: "a-input", value: order.tracking_number ?? "",
    placeholder: "Tracking number" }) as HTMLInputElement;
  const courier = h("input", { class: "a-input", value: order.courier ?? "",
    placeholder: "Who's delivering it" }) as HTMLInputElement;
  const notes = h("textarea", { class: "a-textarea", placeholder: "Only you can see this." }) as HTMLTextAreaElement;
  notes.value = order.notes ?? "";

  root.appendChild(h("div", { class: "a-card" }, [
    h("h2", { text: "Moving it along", style: "margin-bottom:14px;" }),
    field("Where it's up to", statusSel),
    field("Add a note to the timeline", statusNote),
    h("button", {
      class: "a-btn", text: "Update status",
      onclick: async (e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement;
        btn.disabled = true;
        try {
          await changeOrderStatus(id, statusSel.value, statusNote.value.trim() || null);
          toast("Status updated"); ctx.refreshBadges(); location.reload();
        } catch (err) { btn.disabled = false; toast(friendlyError(err, "update the status"), "err"); }
      },
    }),
    h("hr", { style: "border:none;border-top:1px solid var(--a-border);margin:20px 0;" }),
    h("div", { class: "a-row" }, [field("Tracking number", tracking), field("Courier", courier)]),
    field("Private note", notes, "For you only — the customer never sees this."),
    h("button", {
      class: "a-btn a-btn--ghost", text: "Save these details",
      onclick: async (e: Event) => {
        const btn = e.currentTarget as HTMLButtonElement;
        btn.disabled = true;
        try {
          await saveOrderFulfilment(id, {
            tracking_number: tracking.value.trim() || null,
            courier: courier.value.trim() || null,
            notes: notes.value.trim() || null,
          });
          toast("Saved");
        } catch (err) { toast(friendlyError(err, "save those details"), "err"); }
        finally { btn.disabled = false; }
      },
    }),
  ]));

  /* ----- timeline ----- */
  const timeline = h("div", { class: "a-card" }, [h("h2", { text: "What's happened", style: "margin-bottom:12px;" })]);
  if (!history.length) {
    timeline.appendChild(h("p", { class: "a-sub", text: "Nothing recorded yet." }));
  } else {
    for (const ev of history) {
      timeline.appendChild(h("div", { style: "padding:10px 0;border-bottom:1px solid var(--a-border);" }, [
        h("div", { style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap;" }, [
          statusPill(ev.status),
          h("span", { class: "a-sub", text: relativeDay(ev.created_at) }),
        ]),
        ev.note ? h("p", { style: "margin:6px 0 0;", text: ev.note }) : null,
      ]));
    }
  }
  root.appendChild(timeline);

  /* ----- emails sent about this order ----- */
  if (notifications.length) {
    const box = h("div", { class: "a-card" }, [h("h2", { text: "Emails to the customer", style: "margin-bottom:12px;" })]);
    for (const n of notifications) {
      const kind = n.status === "sent" ? "a-pill--ok" : n.status === "failed" ? "a-pill--err" : "a-pill--warn";
      const label = n.status === "sent" ? "Sent" : n.status === "failed" ? "Could not send" : "Waiting to send";
      box.appendChild(h("div", { style: "display:flex;gap:10px;align-items:center;padding:8px 0;flex-wrap:wrap;" }, [
        h("span", { class: `a-pill ${kind}`, text: label }),
        h("span", { class: "a-sub", text: "About a change to the items · " + relativeDay(n.created_at) }),
        n.status === "failed" || n.status === "pending"
          ? h("button", { class: "a-btn a-btn--ghost a-btn--sm", text: "Try again",
              onclick: async (e: Event) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.disabled = true;
                try {
                  await (await import("../../supabase")).supabase.functions
                    .invoke("send-order-revision", { body: { order_id: id } });
                  toast("Tried again"); location.reload();
                } catch { btn.disabled = false; toast("Still could not send it.", "err"); }
              } })
          : null,
      ]));
    }
    root.appendChild(box);
  }
});
