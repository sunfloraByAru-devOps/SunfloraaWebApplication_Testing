/* Products list — search, inline In stock / Show on site toggles, and which
   products appear in the two carousels on the home page.
 *
 * Those carousels used to advertise ten products that were not in this
 * database at prices nobody would honour. They now show real rows, and this is
 * where they are chosen — on the products screen rather than a screen of their
 * own, because the picks *are* products and this is where Aru already looks
 * for them. */

import { route, type ViewCtx } from "../app";
import {
  listProducts, setProductFlag, listHomePickMap, setHomePick,
  HOME_SECTION_LABELS, type HomeSection, type ProductListItem,
} from "../api";
import { photoImg } from "../images";
import { h, clear, banner, friendlyError, rupees, toggle, flashSaved, emptyState, toast } from "../ui";

type PickMap = Map<string, { section: HomeSection; order: number | null }>;

const SECTIONS: HomeSection[] = ["best_sellers", "new_arrivals"];

function productRow(
  p: ProductListItem, ctx: ViewCtx, picks: PickMap, onPickChange: () => void,
) {
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

  /* A product with no photo cannot go in a carousel: the storefront fetches
     that image while building, so picking one without a photo turns the next
     publish into a failed build rather than a card with a gap. */
  const canFeature = !!p.primary_image_path;
  const current = picks.get(p.id);

  const picker = h("select", {
    class: "a-input", "aria-label": "Show on the home page",
    style: "max-width:170px;",
    disabled: !canFeature,
    title: canFeature ? null : "Add a photo before featuring this product",
  }, [
    h("option", { value: "", text: "Not on home page" }),
    ...SECTIONS.map((sec) =>
      h("option", { value: sec, text: HOME_SECTION_LABELS[sec] })),
  ]) as HTMLSelectElement;
  picker.value = current?.section ?? "";

  picker.addEventListener("change", async () => {
    const next = (picker.value || null) as HomeSection | null;
    const prev = current?.section ?? null;
    if (next === prev) return;
    try {
      // Appended to the end of its section; order is adjusted from the summary.
      const order = next
        ? [...picks.values()].filter((v) => v.section === next).length
        : null;
      await setHomePick(p.id, next, order);
      if (next) picks.set(p.id, { section: next, order });
      else picks.delete(p.id);
      flashSaved(saved, true);
      onPickChange();
      ctx.refreshBadges();
    } catch (err) {
      picker.value = prev ?? "";
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
      picker,
      saved,
      h("a", { class: "a-btn a-btn--ghost a-btn--sm", href: `#/products/${p.id}`, text: "Edit" }),
    ]),
  ]);
}

route(/^#\/products$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let products: ProductListItem[];
  let picks: PickMap;
  try { [products, picks] = await Promise.all([listProducts(), listHomePickMap()]); }
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

  /* A standing summary of what the home page currently shows, so the two
     carousels are visible without hunting through the list for the products
     that happen to be in them. */
  const homeCard = h("div", { class: "a-card", style: "margin-bottom:18px;" });
  root.appendChild(homeCard);

  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? "A product";
  const liveOf = (id: string) => products.find((p) => p.id === id)?.is_active ?? false;

  const drawHome = () => {
    clear(homeCard);
    homeCard.appendChild(h("h2", { text: "On the home page", style: "margin-bottom:4px;" }));
    homeCard.appendChild(h("p", { class: "a-sub", style: "margin-bottom:14px;",
      text: "The two rows of products customers see before they reach the shop." }));

    for (const sec of SECTIONS) {
      const ids = [...picks.entries()]
        .filter(([, v]) => v.section === sec)
        .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
        .map(([id]) => id);

      const rows = h("div", { class: "a-rows", style: "margin-bottom:14px;" });

      if (!ids.length) {
        rows.appendChild(h("p", { class: "a-hint",
          text: "Nothing chosen yet. Pick products below — this row stays empty until you do, " +
                "and the home page will not build without at least one." }));
      }

      ids.forEach((id, i) => {
        const hidden = !liveOf(id);
        rows.appendChild(h("div", { class: "a-rowitem" }, [
          h("div", { class: "a-rowitem__main" }, [
            h("div", { class: "a-rowitem__name", text: nameOf(id) }),
            hidden ? h("div", { class: "a-rowitem__meta",
              text: "Hidden from the shop, so it will not appear here either." }) : null,
          ]),
          h("div", { class: "a-rowitem__actions" }, [
            h("button", { class: "a-btn a-btn--quiet a-btn--sm", text: "↑", "aria-label": "Move up",
              disabled: i === 0,
              onclick: () => void move(sec, ids, i, i - 1) }),
            h("button", { class: "a-btn a-btn--quiet a-btn--sm", text: "↓", "aria-label": "Move down",
              disabled: i === ids.length - 1,
              onclick: () => void move(sec, ids, i, i + 1) }),
            h("a", { class: "a-btn a-btn--ghost a-btn--sm", href: `#/products/${id}`, text: "Edit" }),
          ]),
        ]));
      });

      homeCard.appendChild(h("div", {}, [
        h("h3", { text: HOME_SECTION_LABELS[sec], style: "margin-bottom:8px;" }),
        rows,
      ]));
    }
  };

  const move = async (sec: HomeSection, ids: string[], from: number, to: number) => {
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    try {
      for (let i = 0; i < next.length; i++) {
        const cur = picks.get(next[i]);
        if (cur && cur.order === i) continue;
        await setHomePick(next[i], sec, i);
        picks.set(next[i], { section: sec, order: i });
      }
      drawHome();
      toast("Order saved");
    } catch (err) { toast(friendlyError(err, "save the new order"), "err"); }
  };

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
    for (const p of shown) list.appendChild(productRow(p, ctx, picks, drawHome));
  };

  drawHome();
  draw("");
  let t: number | undefined;
  search.addEventListener("input", () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => draw(search.value), 120);
  });
});
