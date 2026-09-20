/* Products list — search, inline In stock / Show on site toggles. */

import { route, type ViewCtx } from "../app";
import { listProducts, setProductFlag, type ProductListItem } from "../api";
import { photoImg } from "../images";
import { h, clear, banner, friendlyError, rupees, toggle, flashSaved, emptyState, toast } from "../ui";

function productRow(p: ProductListItem, ctx: ViewCtx) {
  const saved = h("span", { class: "a-saved" });

  const flag = (field: "in_stock" | "is_active", label: string) =>
    toggle(label, (p as any)[field], async (value) => {
      try {
        await setProductFlag(p.id, field, value);
        (p as any)[field] = value;
        flashSaved(saved, true);
        ctx.refreshBadges();
      } catch (err) {
        flashSaved(saved, false);
        toast(friendlyError(err, "save that change"), "err");
      }
    });

  const thumb = p.primary_image_path
    ? photoImg(p.primary_image_path, "", "a-rowitem__thumb")
    : h("div", { class: "a-rowitem__thumb", "aria-hidden": "true",
        style: "display:flex;align-items:center;justify-content:center;font-size:1.3rem;", text: "🧶" });

  return h("div", { class: "a-rowitem" }, [
    thumb,
    h("a", { class: "a-rowitem__main", href: `#/products/${p.id}`,
      style: "text-decoration:none;color:inherit;" }, [
      h("div", { class: "a-rowitem__name", text: p.name }),
      h("div", { class: "a-rowitem__meta" }, [
        document.createTextNode(p.category_name || "Uncategorised"),
        document.createTextNode(" · "),
        h("strong", { text: rupees(p.base_price) }),
        p.base_mrp && Number(p.base_mrp) > Number(p.base_price ?? 0)
          ? h("span", { style: "opacity:.6;text-decoration:line-through;margin-left:6px;",
              text: rupees(p.base_mrp) }) : null,
      ]),
    ]),
    h("div", { class: "a-rowitem__actions" }, [
      flag("in_stock", "In stock"),
      flag("is_active", "Show on site"),
      saved,
      h("a", { class: "a-btn a-btn--ghost a-btn--sm", href: `#/products/${p.id}`, text: "Edit" }),
    ]),
  ]);
}

route(/^#\/products$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let products: ProductListItem[];
  try { products = await listProducts(); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "load your products"))); return; }

  clear(root);

  const search = h("input", {
    class: "a-input", type: "search", placeholder: "Search by name…",
    "aria-label": "Search products", style: "max-width:280px;",
  }) as HTMLInputElement;

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Products" }),
      h("p", { class: "a-sub", text: `${products.length} in your shop` }),
    ]),
    search,
    h("a", { class: "a-btn", href: "#/products/new", text: "+ Add product" }),
  ]));

  const list = h("div", { class: "a-rows" });
  root.appendChild(list);

  const draw = (term: string) => {
    clear(list);
    const q = term.trim().toLowerCase();
    const shown = q ? products.filter((p) => (p.name || "").toLowerCase().includes(q)) : products;
    if (!shown.length) {
      list.appendChild(q
        ? emptyState("Nothing found", `No product matches “${term}”.`)
        : emptyState("No products yet", "Add your first product to get started.",
            h("a", { class: "a-btn", href: "#/products/new", text: "+ Add product",
              style: "margin-top:14px;" })));
      return;
    }
    for (const p of shown) list.appendChild(productRow(p, ctx));
  };

  draw("");
  let t: number | undefined;
  search.addEventListener("input", () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => draw(search.value), 120);
  });
});
