/* Categories — name, visible toggle, reorder. */

import { route, type ViewCtx } from "../app";
import { listCategories, saveCategory, deleteCategory, type Category } from "../api";
import { h, clear, banner, friendlyError, toast, confirmAction, toggle, flashSaved, emptyState } from "../ui";

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
      h("p", { class: "a-sub", text: "How products are grouped in your shop." }),
    ]),
  ]));

  const list = h("div", { class: "a-rows" });
  root.appendChild(list);

  const persistOrder = async () => {
    try {
      for (let i = 0; i < cats.length; i++) {
        if (cats[i].display_order === i) continue;
        await saveCategory(cats[i].id, { display_order: i });
        cats[i].display_order = i;
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
      const nameInput = h("input", { class: "a-input", value: c.name, "aria-label": "Category name" }) as HTMLInputElement;

      nameInput.addEventListener("change", async () => {
        const next = nameInput.value.trim();
        if (!next || next === c.name) { nameInput.value = c.name; return; }
        try { await saveCategory(c.id, { name: next }); c.name = next; flashSaved(saved, true); }
        catch (err) { nameInput.value = c.name; flashSaved(saved, false); toast(friendlyError(err, "rename that category"), "err"); }
      });

      list.appendChild(h("div", { class: "a-rowitem" }, [
        h("div", { style: "display:flex;flex-direction:column;gap:2px;flex:0 0 auto;" }, [
          h("button", { class: "a-btn a-btn--quiet a-btn--sm", text: "↑", "aria-label": "Move up",
            disabled: i === 0,
            onclick: async () => { if (i === 0) return; [cats[i-1], cats[i]] = [cats[i], cats[i-1]]; draw(); await persistOrder(); } }),
          h("button", { class: "a-btn a-btn--quiet a-btn--sm", text: "↓", "aria-label": "Move down",
            disabled: i === cats.length - 1,
            onclick: async () => { if (i >= cats.length-1) return; [cats[i+1], cats[i]] = [cats[i], cats[i+1]]; draw(); await persistOrder(); } }),
        ]),
        h("div", { class: "a-rowitem__main" }, [nameInput]),
        h("div", { class: "a-rowitem__actions" }, [
          toggle("Show on site", c.is_active, async (v) => {
            try { await saveCategory(c.id, { is_active: v }); c.is_active = v; flashSaved(saved, true); }
            catch (err) { flashSaved(saved, false); toast(friendlyError(err, "save that change"), "err"); }
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
      await saveCategory(null, { name, slug: slugify(name), is_active: true, display_order: cats.length });
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
