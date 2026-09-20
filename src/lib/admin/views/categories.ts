/* Categories — name, photo, how they appear on the home page, order.
 *
 * The home page's four category cards used to be a hardcoded array in which the
 * label, the picture and the link were three unrelated strings, so two of the
 * four opened a shelf they did not name. Everything a card shows now comes from
 * the row edited here, which makes that mismatch impossible rather than merely
 * fixed.
 *
 * Two fields look similar and are not: the NAME is the identity the shop filter
 * and the card's link both match on, and "Shown as" is only what a customer
 * reads. Renaming the second can never break a link. */

import { route, type ViewCtx } from "../app";
import {
  listCategories, saveCategory, deleteCategory, setCategoryImage,
  SITE_BUCKET, type Category,
} from "../api";
import {
  h, clear, banner, friendlyError, toast, confirmAction, toggle, flashSaved,
  emptyState, spinner,
} from "../ui";
import { photoImg } from "../images";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

route(/^#\/categories$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let cats: Category[];
  try { cats = await listCategories(); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "load your categories"))); return; }

  clear(root);
  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Categories" }),
      h("p", { class: "a-sub",
        text: "How products are grouped in your shop, and the cards on your home page." }),
    ]),
  ]));

  const list = h("div", { class: "a-rows" });
  root.appendChild(list);

  /* One order, two uses: the position in the shop's filter bar, and the
     position among the home page cards. Keeping them as one list is the only
     version Aru has to think about. */
  const persistOrder = async () => {
    try {
      let homeIndex = 0;
      for (let i = 0; i < cats.length; i++) {
        const c = cats[i];
        const nextHome = c.show_on_home ? homeIndex++ : null;
        if (c.display_order === i && c.home_order === nextHome) continue;
        await saveCategory(c.id, { display_order: i, home_order: nextHome });
        c.display_order = i;
        c.home_order = nextHome;
      }
      toast("Order saved");
    } catch (err) { toast(friendlyError(err, "save the new order"), "err"); }
  };

  const draw = () => {
    clear(list);
    if (!cats.length) {
      list.appendChild(emptyState("No categories yet", "Add one to group your products."));
    }
    cats.forEach((c, i) => {
      const saved = h("span", { class: "a-saved" });

      const save = async (patch: Partial<Category>, what: string, revert: () => void) => {
        try { await saveCategory(c.id, patch); Object.assign(c, patch); flashSaved(saved, true); ctx.refreshBadges(); }
        catch (err) { revert(); flashSaved(saved, false); toast(friendlyError(err, what), "err"); }
      };

      /* ---- name (the identity) ---- */
      const nameInput = h("input", {
        class: "a-input", value: c.name, "aria-label": "Category name",
      }) as HTMLInputElement;
      nameInput.addEventListener("change", async () => {
        const next = nameInput.value.trim();
        if (!next || next === c.name) { nameInput.value = c.name; return; }
        await save({ name: next }, "rename that category", () => { nameInput.value = c.name; });
      });

      /* ---- label (what customers read) ---- */
      const labelInput = h("input", {
        class: "a-input", value: c.display_label ?? "", placeholder: c.name,
        "aria-label": "Shown as",
      }) as HTMLInputElement;
      labelInput.addEventListener("change", async () => {
        const next = labelInput.value.trim();
        const prev = c.display_label ?? "";
        if (next === prev) return;
        await save({ display_label: next || null }, "save that label",
          () => { labelInput.value = prev; });
      });

      /* ---- "From" price override ---- */
      const priceInput = h("input", {
        class: "a-input", value: c.home_price_note ?? "", placeholder: "cheapest item",
        "aria-label": "From price",
      }) as HTMLInputElement;
      priceInput.addEventListener("change", async () => {
        const next = priceInput.value.trim();
        const prev = c.home_price_note ?? "";
        if (next === prev) return;
        await save({ home_price_note: next || null }, "save that price",
          () => { priceInput.value = prev; });
      });

      /* ---- photo ---- */
      const thumbWrap = h("div", {
        style: "flex:0 0 auto;width:72px;height:72px;border-radius:10px;overflow:hidden;" +
               "background:var(--a-bg-alt);display:flex;align-items:center;justify-content:center;",
      });
      const drawThumb = () => {
        clear(thumbWrap);
        if (c.image_path) {
          const img = photoImg(c.image_path, c.image_alt ?? c.name, "", SITE_BUCKET);
          img.style.cssText = "width:100%;height:100%;object-fit:cover;";
          thumbWrap.appendChild(img);
        } else {
          thumbWrap.appendChild(h("span", { class: "a-hint", text: "No photo" }));
        }
      };
      drawThumb();

      const fileInput = h("input", {
        type: "file", accept: "image/*", class: "a-sr",
      }) as HTMLInputElement;
      const photoBtn = h("button", {
        class: "a-btn a-btn--ghost a-btn--sm",
        text: c.image_path ? "Change photo" : "Add a photo",
        onclick: () => fileInput.click(),
      }) as HTMLButtonElement;

      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;
        clear(thumbWrap); thumbWrap.appendChild(spinner());
        photoBtn.disabled = true;
        try {
          const patch = await setCategoryImage(c.id, file, `${c.display_label || c.name} — handmade crochet`);
          Object.assign(c, patch);
          photoBtn.textContent = "Change photo";
          toast("Photo saved");
          ctx.refreshBadges();
        } catch (err: any) {
          const why = err?.message === "too-large"
            ? `“${file.name}” is too big to use. Please pick a smaller photo.`
            : err?.message === "not-an-image"
              ? `“${file.name}” isn't a photo.`
              : friendlyError(err, "save that photo");
          toast(why, "err");
        } finally {
          photoBtn.disabled = false;
          drawThumb();
        }
      });

      list.appendChild(h("div", { class: "a-rowitem", style: "align-items:flex-start;" }, [
        h("div", { style: "display:flex;flex-direction:column;gap:2px;flex:0 0 auto;" }, [
          h("button", { class: "a-btn a-btn--quiet a-btn--sm", text: "↑", "aria-label": "Move up",
            disabled: i === 0,
            onclick: async () => { if (i === 0) return; [cats[i-1], cats[i]] = [cats[i], cats[i-1]]; draw(); await persistOrder(); } }),
          h("button", { class: "a-btn a-btn--quiet a-btn--sm", text: "↓", "aria-label": "Move down",
            disabled: i === cats.length - 1,
            onclick: async () => { if (i >= cats.length-1) return; [cats[i+1], cats[i]] = [cats[i], cats[i+1]]; draw(); await persistOrder(); } }),
        ]),
        thumbWrap,
        h("div", { class: "a-rowitem__main" }, [
          nameInput,
          h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;" }, [
            h("div", { style: "flex:1 1 180px;" }, [
              h("label", { class: "a-label", text: "Shown as" }),
              labelInput,
              h("p", { class: "a-hint",
                text: "What customers read. The link still uses the name above." }),
            ]),
            h("div", { style: "flex:1 1 140px;" }, [
              h("label", { class: "a-label", text: "From price" }),
              priceInput,
              h("p", { class: "a-hint",
                text: "Leave blank to use the cheapest item in stock." }),
            ]),
          ]),
          h("div", { style: "margin-top:8px;" }, [photoBtn, fileInput]),
        ]),
        h("div", { class: "a-rowitem__actions" }, [
          toggle("Show in shop", c.is_active, async (v) => {
            await save({ is_active: v }, "save that change", () => {});
          }),
          toggle("Show on home page", c.show_on_home, async (v) => {
            /* A card with no photo would render as a gap, so refuse rather than
               ship a hole in the row. */
            if (v && !c.image_path) {
              toast("Add a photo first — a card without one leaves a gap.", "err");
              draw();
              return;
            }
            await save({ show_on_home: v }, "save that change", () => {});
            await persistOrder();
            draw();
          }),
          saved,
          h("button", {
            class: "a-btn a-btn--danger a-btn--sm", text: "Delete",
            onclick: async () => {
              if (!await confirmAction(
                `Delete “${c.name}”? Products in it will lose their category.`, "Delete category")) return;
              try {
                await deleteCategory(c.id);
                cats = cats.filter((x) => x.id !== c.id);
                toast("Category deleted"); draw();
              } catch (err) { toast(friendlyError(err, "delete that category"), "err"); }
            },
          }),
        ]),
      ]));
    });
  };
  draw();

  /* Add new */
  const newName = h("input", { class: "a-input", placeholder: "New category name" }) as HTMLInputElement;
  const addBtn = h("button", { class: "a-btn", text: "Add category" }) as HTMLButtonElement;
  addBtn.addEventListener("click", async () => {
    const name = newName.value.trim();
    if (!name) { newName.focus(); return; }
    addBtn.disabled = true;
    try {
      await saveCategory(null, {
        name, slug: slugify(name), is_active: true,
        display_order: cats.length, display_label: name,
      });
      cats = await listCategories();
      newName.value = "";
      toast("Category added");
      draw();
    } catch (err) { toast(friendlyError(err, "add that category"), "err"); }
    finally { addBtn.disabled = false; }
  });

  root.appendChild(h("div", { class: "a-card", style: "margin-top:18px;" }, [
    h("h2", { text: "Add a category", style: "margin-bottom:12px;" }),
    h("div", { class: "a-row", style: "align-items:center;" }, [ newName, h("div", { style:"flex:0 0 auto;" }, [addBtn]) ]),
  ]));
});
