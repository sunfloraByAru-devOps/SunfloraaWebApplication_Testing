/* Customers — read only. This exists so Aru can look someone up when they
   email her. Nothing here is editable, and there is no delete. */

import { route, type ViewCtx } from "../app";
import { listCustomers, getCustomer, type Customer } from "../api";
import { h, clear, banner, friendlyError, rupees, relativeDay, shortDate, emptyState } from "../ui";

route(/^#\/customers$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let people: Customer[];
  try { people = await listCustomers(); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "load your customers"))); return; }

  clear(root);
  const search = h("input", { class: "a-input", type: "search", placeholder: "Search by name…",
    style: "max-width:260px;" }) as HTMLInputElement;

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Customers" }),
      h("p", { class: "a-sub", text: `${people.length} with an account` }),
    ]),
    search,
  ]));

  const list = h("div", { class: "a-rows" });
  root.appendChild(list);

  const draw = () => {
    clear(list);
    const q = search.value.trim().toLowerCase();
    const shown = q ? people.filter((p) => (p.full_name || "").toLowerCase().includes(q)) : people;
    if (!shown.length) {
      list.appendChild(emptyState("Nobody found",
        q ? `No customer matches “${search.value}”.` : "Customers appear here once they make an account."));
      return;
    }
    for (const p of shown) {
      // Deliberately no phone or email in the list — only on the one screen that needs them.
      list.appendChild(h("a", { class: "a-rowitem", href: `#/customers/${p.id}`,
        style: "text-decoration:none;color:inherit;" }, [
        h("div", { class: "a-rowitem__main" }, [
          h("div", { class: "a-rowitem__name", text: p.full_name || "Unnamed customer" }),
          h("div", { class: "a-rowitem__meta", text: p.orderCount
            ? `${p.orderCount} order${p.orderCount === 1 ? "" : "s"} · last ${relativeDay(p.lastOrder)}`
            : "No orders yet" }),
        ]),
        p.totalSpent > 0
          ? h("strong", { text: rupees(p.totalSpent), style: "color:var(--a-head);" })
          : null,
      ]));
    }
  };
  draw();
  search.addEventListener("input", draw);
});

route(/^#\/customers\/([0-9a-fA-F-]{36})$/, async (ctx: ViewCtx, params) => {
  const { root } = ctx;
  let d;
  try { d = await getCustomer(params[0]); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "open that customer"))); return; }

  clear(root);
  const p: any = d.profile ?? {};

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: p.full_name || "Customer" }),
      h("p", { class: "a-sub", text: p.created_at ? `With you since ${shortDate(p.created_at)}` : "" }),
    ]),
    h("a", { class: "a-btn a-btn--quiet a-btn--sm", href: "#/customers", text: "← All customers" }),
  ]));

  root.appendChild(h("div", { class: "a-card" }, [
    h("h2", { text: "How to reach them", style: "margin-bottom:12px;" }),
    p.phone
      ? h("p", { style: "margin:0;" }, [h("a", { href: `tel:${p.phone}`, style: "color:var(--a-rose);", text: p.phone })])
      : h("p", { class: "a-sub", text: "No phone number on file." }),
    ...d.addresses.map((a: any) => h("p", { style: "margin:12px 0 0;white-space:pre-line;", text:
      [a.label, a.line1, a.line2, a.city, a.state, a.pincode, a.country].filter(Boolean).join("\n") })),
    !d.addresses.length ? h("p", { class: "a-sub", text: "No delivery address saved." }) : null,
  ]));

  const orders = h("div", { class: "a-card" }, [h("h2", { text: "Their orders", style: "margin-bottom:12px;" })]);
  if (!d.orders.length) {
    orders.appendChild(h("p", { class: "a-sub", text: "They haven't ordered anything yet." }));
  } else {
    for (const o of d.orders) {
      orders.appendChild(h("a", { href: `#/orders/${o.id}`,
        style: "display:flex;justify-content:space-between;gap:12px;padding:10px 0;" +
               "border-bottom:1px solid var(--a-border);text-decoration:none;color:inherit;" }, [
        h("div", {}, [
          h("div", { style: "font-weight:600;color:var(--a-head);", text: o.order_number }),
          h("div", { class: "a-sub", text: relativeDay(o.created_at) }),
        ]),
        h("strong", { text: rupees(o.total), style: "color:var(--a-head);white-space:nowrap;" }),
      ]));
    }
  }
  root.appendChild(orders);
});
