/* Photos — every picture in the shop, and what's wrong with any of them.
 *
 * These problems are invisible from the product editor: a product with no
 * photos looks perfectly fine in the products list, but its shop page is an
 * empty gallery. */

import { route, type ViewCtx } from "../app";
import { getPhotoOverview, setPhotoAlt, type PhotoOverviewItem } from "../api";
import { photoImg } from "../images";
import { h, clear, banner, friendlyError, toast, emptyState, flashSaved } from "../ui";

route(/^#\/photos$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let data;
  try { data = await getPhotoOverview(); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "load your photos"))); return; }

  const { photos, productsWithNone } = data;
  const missingAlt = photos.filter((p) => !p.alt_text || !p.alt_text.trim());
  const liveWithNone = productsWithNone.filter((p) => p.is_active);
  const issueCount = liveWithNone.length + missingAlt.length;

  clear(root);
  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Photos" }),
      h("p", { class: "a-sub", text: `${photos.length} across ${new Set(photos.map(p => p.product_id)).size} products` }),
    ]),
  ]));

  /* ---- needs attention ---- */
  if (issueCount) {
    root.appendChild(h("h2", { text: "Needs attention", style: "margin-bottom:12px;" }));
    const list = h("div", { class: "a-rows" });

    for (const p of liveWithNone) {
      list.appendChild(h("div", { class: "a-rowitem" }, [
        h("div", { class: "a-rowitem__thumb", "aria-hidden": "true",
          style: "display:flex;align-items:center;justify-content:center;font-size:1.3rem;" +
                 "background:var(--a-err-bg);color:var(--a-err);", text: "!" }),
        h("div", { class: "a-rowitem__main" }, [
          h("div", { class: "a-rowitem__name", text: p.name }),
          h("div", { class: "a-rowitem__meta",
            text: "Showing in the shop with no photos at all." }),
        ]),
        h("a", { class: "a-btn a-btn--sm", href: `#/products/${p.id}`, text: "Add photos" }),
      ]));
    }

    for (const p of missingAlt.slice(0, 20)) {
      const saved = h("span", { class: "a-saved" });
      const input = h("input", { class: "a-input", placeholder: "Describe this photo",
        "aria-label": `Description for a photo of ${p.productName}` }) as HTMLInputElement;
      input.addEventListener("change", async () => {
        const v = input.value.trim();
        if (!v) return;
        try { await setPhotoAlt(p.id, v); p.alt_text = v; flashSaved(saved, true); ctx.refreshBadges(); }
        catch (err) { flashSaved(saved, false); toast(friendlyError(err, "save that description"), "err"); }
      });

      list.appendChild(h("div", { class: "a-rowitem" }, [
        photoImg(p.storage_path, "", "a-rowitem__thumb"),
        h("div", { class: "a-rowitem__main" }, [
          h("div", { class: "a-rowitem__name", text: p.productName }),
          h("div", { class: "a-rowitem__meta", text: "No description — screen readers and Google can't tell what it shows." }),
          h("div", { style: "margin-top:8px;" }, [input]),
        ]),
        saved,
      ]));
    }
    root.appendChild(list);
  } else {
    root.appendChild(h("div", { class: "a-card" }, [
      emptyState("Every photo is in good shape", "Nothing missing, nothing undescribed."),
    ]));
  }

  /* ---- browse by product ---- */
  root.appendChild(h("h2", { text: "All photos", style: "margin:28px 0 12px;" }));

  const byProduct = new Map<string, PhotoOverviewItem[]>();
  for (const p of photos) {
    if (!byProduct.has(p.product_id)) byProduct.set(p.product_id, []);
    byProduct.get(p.product_id)!.push(p);
  }

  for (const [productId, list] of byProduct) {
    const name = list[0].productName;
    const grid = h("div", { class: "a-photos", style: "margin-bottom:22px;" });
    for (const p of list) {
      grid.appendChild(h("a", {
        class: "a-photo" + (p.is_primary ? " is-primary" : ""),
        href: `#/products/${productId}`,
        "aria-label": `${name}, photo ${(p.display_order ?? 0) + 1}`,
      }, [
        photoImg(p.storage_path, p.alt_text ?? ""),
        p.is_primary ? h("span", { class: "a-photo__tag", text: "Main" }) : null,
        !p.alt_text || !p.alt_text.trim()
          ? h("span", { class: "a-photo__warn", title: "No description", text: "!" }) : null,
      ]));
    }
    root.appendChild(h("div", {}, [
      h("h3", { style: "margin-bottom:8px;" }, [
        h("a", { href: `#/products/${productId}`, style: "color:inherit;text-decoration:none;",
          text: `${name} · ${list.length}` }),
      ]),
      grid,
    ]));
  }
});
