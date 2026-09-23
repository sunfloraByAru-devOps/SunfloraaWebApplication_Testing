/* Product editor — one page, one form, plain language.
   Never shows id, sku internals, search_vector, timestamps, rating or review
   count: ratings and counts are worked out from real reviews, not typed in. */

import { route, type ViewCtx } from "../app";
import {
  getProduct, createProduct, updateProduct, deleteProduct,
  listCategories, listPhotos, addPhoto, deletePhoto, savePhotoOrder, setPrimaryPhoto,
  prettyBytes, setPhotoAlt, listOptions, replaceOptions, OPTION_TABLES,
  type ProductRow, type Photo, type Category,
} from "../api";
import {
  h, clear, banner, friendlyError, field, toggle, toast, confirmAction, spinner, emptyState,
} from "../ui";
import { photoImg } from "../images";

const MAX_MB = 5;

/* ---------------- photos ---------------- */

function photosSection(productId: string | null, productName: string, ctx: ViewCtx) {
  const wrap = h("div");
  if (!productId) {
    wrap.appendChild(h("p", { class: "a-sub",
      text: "Save this product first, then you can add photos." }));
    return { el: wrap, reload: async () => {} };
  }

  const grid = h("div", { class: "a-photos" });
  const summary = h("p", { class: "a-hint" });
  const fileInput = h("input", {
    type: "file", accept: "image/*", multiple: true, class: "a-sr",
  }) as HTMLInputElement;

  const zone = h("div", {
    class: "a-dropzone", tabindex: "0", role: "button", "aria-label": "Add photos",
  }, [
    h("div", { style: "font-size:1.6rem;", text: "📷" }),
    h("div", { style: "font-weight:600;color:var(--a-head);margin-top:4px;",
      text: "Drop photos here, or tap to choose" }),
    h("div", { class: "a-hint", text: "Straight off your phone is fine — we shrink them for you." }),
  ]);

  let photos: Photo[] = [];

  const openSheet = (p: Photo, index: number) => {
    const alt = h("input", { class: "a-input", value: p.alt_text ?? "",
      placeholder: "e.g. Sunflower bouquet on a desk" }) as HTMLInputElement;

    const done = () => overlay.remove();
    const overlay = h("div", {
      style: "position:fixed;inset:0;background:rgba(92,61,46,.4);display:flex;" +
             "align-items:flex-end;justify-content:center;padding:0;z-index:90;",
      onclick: (e: MouseEvent) => { if (e.target === overlay) done(); },
    }, [
      h("div", { class: "a-card", style: "max-width:460px;width:100%;border-radius:20px 20px 0 0;" }, [
        (() => {
          const preview = photoImg(p.storage_path, p.alt_text ?? "");
          preview.style.cssText = "width:100%;max-height:200px;object-fit:contain;" +
            "border-radius:12px;background:var(--a-bg-alt);";
          return preview;
        })(),
        h("div", { style: "margin-top:14px;" }, [
          field("Describe this photo", alt,
            "Read aloud to people who can't see it, and used by Google."),
        ]),
        h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;" }, [
          p.is_primary ? null : h("button", {
            class: "a-btn a-btn--ghost a-btn--sm", text: "Make this the main photo",
            onclick: async () => {
              try {
                await setPrimaryPhoto(productId, p.id);
                photos.forEach((q) => (q.is_primary = q.id === p.id));
                done(); draw(); toast("Main photo updated");
              } catch (err) { toast(friendlyError(err, "set the main photo"), "err"); }
            },
          }),
          h("button", {
            class: "a-btn a-btn--danger a-btn--sm", text: "Delete this photo",
            onclick: async () => {
              if (!await confirmAction("Delete this photo? This cannot be undone.", "Delete photo")) return;
              try {
                await deletePhoto(p);
                photos = photos.filter((q) => q.id !== p.id);
                if (p.is_primary && photos.length) {
                  await setPrimaryPhoto(productId, photos[0].id);
                  photos[0].is_primary = true;
                }
                await savePhotoOrder(photos);
                done(); draw(); toast("Photo deleted");
              } catch (err) { toast(friendlyError(err, "delete that photo"), "err"); }
            },
          }),
          h("div", { style: "flex:1;" }),
          h("button", {
            class: "a-btn a-btn--sm", text: "Done",
            onclick: async () => {
              const next = alt.value.trim();
              if (next !== (p.alt_text ?? "")) {
                try { await setPhotoAlt(p.id, next); p.alt_text = next; toast("Saved"); }
                catch (err) { toast(friendlyError(err, "save that description"), "err"); return; }
              }
              done(); draw();
            },
          }),
        ]),
      ]),
    ]);
    document.body.appendChild(overlay);
    alt.focus();
  };

  const draw = () => {
    clear(grid);
    if (!photos.length) {
      grid.appendChild(h("p", { class: "a-sub", style: "grid-column:1/-1;",
        text: "No photos yet. The first one you add becomes the main photo." }));
    }
    photos.forEach((p, index) => {
      const missingAlt = !p.alt_text || !p.alt_text.trim();
      const card = h("div", {
        class: "a-photo" + (p.is_primary ? " is-primary" : ""),
        draggable: "true", dataset: { index: String(index) },
        onclick: () => openSheet(p, index),
        tabindex: "0", role: "button",
        "aria-label": `Photo ${index + 1}${p.is_primary ? ", main photo" : ""}`,
      }, [
        photoImg(p.storage_path, p.alt_text ?? ""),
        p.is_primary ? h("span", { class: "a-photo__tag", text: "Main" }) : null,
        missingAlt ? h("span", { class: "a-photo__warn", title: "No description written", text: "!" }) : null,
      ]);

      card.addEventListener("keydown", (e) => {
        const k = (e as KeyboardEvent).key;
        if (k === "Enter" || k === " ") { e.preventDefault(); openSheet(p, index); }
      });
      card.addEventListener("dragstart", (e) => {
        (e as DragEvent).dataTransfer?.setData("text/plain", String(index));
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
      card.addEventListener("dragover", (e) => e.preventDefault());
      card.addEventListener("drop", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const from = Number((e as DragEvent).dataTransfer?.getData("text/plain"));
        if (isNaN(from) || from === index) return;
        const [moved] = photos.splice(from, 1);
        photos.splice(index, 0, moved);
        draw();
        try { await savePhotoOrder(photos); toast("Photo order saved"); }
        catch (err) { toast(friendlyError(err, "save the new order"), "err"); }
      });

      grid.appendChild(card);
    });

    const noAlt = photos.filter((p) => !p.alt_text || !p.alt_text.trim()).length;
    summary.textContent = photos.length
      ? `${photos.length} photo${photos.length === 1 ? "" : "s"}. Drag to reorder — the one marked “Main” shows first in the shop.` +
        (noAlt ? ` ${noAlt} still needs a description.` : "")
      : "";
  };

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) { toast("Please choose an image file.", "err"); return; }

    let saved = 0, added = 0;
    for (const file of list) {
      const placeholder = h("div", { class: "a-photo" }, [spinner()]);
      grid.appendChild(placeholder);
      try {
        const created = await addPhoto(productId, file, photos.length, photos.length === 0, productName);
        photos.push(created);
        saved += created.savedBytes ?? 0;
        added++;
        placeholder.remove();
        draw();
      } catch (err: any) {
        placeholder.remove();
        const why = err?.message === "too-large"
          ? `“${file.name}” is too big to use. Please pick a smaller photo.`
          : err?.message === "not-an-image"
            ? `“${file.name}” isn't a photo.`
            : friendlyError(err, "add that photo");
        toast(why, "err");
      }
    }
    if (added) {
      toast(saved > 0
        ? `${added} photo${added === 1 ? "" : "s"} added — saved ${prettyBytes(saved)}`
        : `${added} photo${added === 1 ? "" : "s"} added`);
      ctx.refreshBadges();
    }
  };

  zone.addEventListener("click", () => fileInput.click());
  zone.addEventListener("keydown", (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === "Enter" || k === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) void upload(fileInput.files);
    fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("is-over"); }));
  zone.addEventListener("drop", (e) => {
    const dropped = (e as DragEvent).dataTransfer?.files;
    if (dropped?.length) void upload(dropped);
  });

  wrap.appendChild(zone);
  wrap.appendChild(fileInput);
  wrap.appendChild(grid);
  wrap.appendChild(summary);

  const reload = async () => {
    try { photos = await listPhotos(productId); draw(); }
    catch (err) { grid.appendChild(banner(friendlyError(err, "load the photos"))); }
  };
  void reload();
  return { el: wrap, reload };
}

/* ---------------- simple repeating option lists ---------------- */

function optionList(title: string, cols: { key: string; label: string; type?: string }[], rows: any[]) {
  const body = h("div");
  const state: any[] = rows.map((r) => ({ ...r }));

  const draw = () => {
    clear(body);
    if (!state.length) body.appendChild(h("p", { class: "a-sub", text: "None yet." }));
    state.forEach((row, i) => {
      const line = h("div", { class: "a-row", style: "align-items:flex-end;margin-bottom:10px;" });
      for (const c of cols) {
        const input = h("input", {
          class: "a-input", type: c.type || "text", value: row[c.key] ?? "",
          placeholder: c.label, "aria-label": c.label,
        }) as HTMLInputElement;
        input.addEventListener("input", () => {
          row[c.key] = c.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value;
        });
        line.appendChild(h("div", { style: "flex:1 1 140px;" }, [input]));
      }
      line.appendChild(h("button", {
        type: "button", class: "a-btn a-btn--danger a-btn--sm", text: "Remove",
        style: "flex:0 0 auto;",
        onclick: () => { state.splice(i, 1); draw(); },
      }));
      body.appendChild(line);
    });
  };
  draw();

  const el = h("div", {}, [
    body,
    h("button", {
      type: "button", class: "a-btn a-btn--ghost a-btn--sm", text: `+ Add ${title.toLowerCase()}`,
      onclick: () => { state.push(Object.fromEntries(cols.map((c) => [c.key, ""]))); draw(); },
    }),
  ]);

  return { el, value: () => state.filter((r) => cols.some((c) => String(r[c.key] ?? "").trim() !== "")) };
}

/* ---------------- editor ---------------- */

async function editor(ctx: ViewCtx, id: string | null) {
  const { root } = ctx;
  const isNew = id === null;

  let product: ProductRow | null = null;
  let categories: Category[] = [];
  try {
    [product, categories] = await Promise.all([
      isNew ? Promise.resolve(null) : getProduct(id!),
      listCategories().catch(() => [] as Category[]),
    ]);
  } catch (err) {
    clear(root); root.appendChild(banner(friendlyError(err, "open that product"))); return;
  }

  clear(root);

  const p = product ?? ({
    id: "", name: "", tagline: "", description: "", category_id: null,
    base_price: null, base_mrp: null, tag: "", is_new: false,
    in_stock: true, is_active: false, display_order: null, sku: null, brand: null,
  } as ProductRow);

  /* Basics */
  const name = h("input", { class: "a-input", value: p.name ?? "", required: true,
    placeholder: "Sunflower bouquet" }) as HTMLInputElement;
  const tagline = h("input", { class: "a-input", value: p.tagline ?? "",
    placeholder: "A cheerful handmade bunch" }) as HTMLInputElement;
  const description = h("textarea", { class: "a-textarea",
    placeholder: "Tell customers about it — what it's made of, how big it is, who it's for." }) as HTMLTextAreaElement;
  description.value = p.description ?? "";

  const category = h("select", { class: "a-select" }) as HTMLSelectElement;
  category.appendChild(h("option", { value: "", text: "— Choose a category —" }));
  for (const c of categories) {
    const opt = h("option", { value: c.id, text: c.name }) as HTMLOptionElement;
    if (c.id === p.category_id) opt.selected = true;
    category.appendChild(opt);
  }

  const price = h("input", { class: "a-input", type: "number", min: "0", step: "1",
    value: p.base_price ?? "", placeholder: "899" }) as HTMLInputElement;
  const mrp = h("input", { class: "a-input", type: "number", min: "0", step: "1",
    value: p.base_mrp ?? "", placeholder: "1199" }) as HTMLInputElement;
  const badge = h("input", { class: "a-input", value: p.tag ?? "",
    placeholder: "Bestseller" }) as HTMLInputElement;

  let inStock = p.in_stock, isActive = p.is_active, isNewFlag = p.is_new;

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: isNew ? "Add a product" : p.name || "Product" }),
      h("p", { class: "a-sub", text: isNew
        ? "Fill in the basics, then add photos."
        : "Changes are saved when you press Save." }),
    ]),
    h("a", { class: "a-btn a-btn--quiet a-btn--sm", href: "#/products", text: "← All products" }),
  ]));

  const messages = h("div");
  root.appendChild(messages);

  root.appendChild(h("div", { class: "a-card" }, [
    h("h2", { text: "Basics", style: "margin-bottom:14px;" }),
    field("Name", name,
      "What customers will see, and what becomes the page title and heading — " +
      "write it the way someone would search for it (what it is, then what makes " +
      "it special), not a pet name. “Sunny” makes a weak title; " +
      "“Sunny Sunflower Keychain” makes a good one."),
    field("Short tagline", tagline,
      "One line under the name. It's also the first sentence Google shows in " +
      "search results, so make it a real reason to buy, not a placeholder."),
    field("Description", description),
    field("Category", category),
    h("div", { class: "a-row" }, [
      field("Price", price, "What you charge, in rupees."),
      field("Was price", mrp, "Shown crossed out. Leave blank if not on offer."),
    ]),
  ]));

  const photosCard = h("div", { class: "a-card" }, [ h("h2", { text: "Photos", style: "margin-bottom:14px;" }) ]);
  const photos = photosSection(isNew ? null : id, p.name ?? "", ctx);
  photosCard.appendChild(photos.el);
  root.appendChild(photosCard);

  /* Options — most products won't need these. */
  let sizes: any, colors: any, details: any, includes: any;
  if (!isNew) {
    const [s, c, d, i] = await Promise.all([
      listOptions("sizes", id!).catch(() => []),
      listOptions("colors", id!).catch(() => []),
      listOptions("details", id!).catch(() => []),
      listOptions("includes", id!).catch(() => []),
    ]);
    sizes = optionList("Size", [
      { key: "label", label: "Size name" }, { key: "cm_description", label: "Measurements" },
      { key: "price", label: "Price", type: "number" }, { key: "mrp", label: "Was price", type: "number" },
    ], s);
    colors = optionList("Colour", [
      { key: "name", label: "Colour name" }, { key: "hex", label: "Colour code e.g. #E8D5C4" },
    ], c);
    details = optionList("Detail", [
      { key: "label", label: "Label e.g. Material" }, { key: "value", label: "Value e.g. Cotton yarn" },
    ], d);
    includes = optionList("Item", [{ key: "item", label: "What's included" }], i);

    root.appendChild(h("details", { class: "a-details" }, [
      h("summary", { text: "More options — sizes, colours, details" }),
      h("div", { class: "a-details__body" }, [
        h("p", { class: "a-sub", style: "margin-top:0;",
          text: "Most products don't need these. Leave them empty unless you offer choices." }),
        h("h3", { text: "Sizes", style: "margin:16px 0 8px;" }), sizes.el,
        h("h3", { text: "Colours", style: "margin:20px 0 8px;" }), colors.el,
        h("h3", { text: "Details", style: "margin:20px 0 8px;" }), details.el,
        h("h3", { text: "What's included", style: "margin:20px 0 8px;" }), includes.el,
      ]),
    ]));
  }

  /* Visibility */
  root.appendChild(h("div", { class: "a-card" }, [
    h("h2", { text: "Visibility", style: "margin-bottom:14px;" }),
    h("div", { style: "display:flex;flex-direction:column;gap:14px;" }, [
      toggle("In stock — customers can buy it", inStock, (v) => { inStock = v; }),
      toggle("Show on site — visible in the shop", isActive, (v) => { isActive = v; }),
      toggle("Mark as new", isNewFlag, (v) => { isNewFlag = v; }),
    ]),
    h("div", { style: "margin-top:16px;" }, [
      field("Badge text", badge, "A small label on the product card. Optional."),
    ]),
  ]));

  /* Save */
  const saveBtn = h("button", { class: "a-btn", text: isNew ? "Create product" : "Save changes" }) as HTMLButtonElement;

  saveBtn.addEventListener("click", async () => {
    clear(messages);
    if (!name.value.trim()) {
      messages.appendChild(banner("Please give the product a name."));
      name.focus(); window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const patch: Partial<ProductRow> = {
      name: name.value.trim(),
      tagline: tagline.value.trim() || null,
      description: description.value.trim() || null,
      category_id: category.value || null,
      base_price: price.value === "" ? null : Number(price.value),
      base_mrp: mrp.value === "" ? null : Number(mrp.value),
      tag: badge.value.trim() || null,
      in_stock: inStock, is_active: isActive, is_new: isNewFlag,
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      if (isNew) {
        const newId = await createProduct(patch);
        toast("Product created — now add some photos");
        ctx.go(`#/products/${newId}`);
        return;
      }
      await updateProduct(id!, patch);
      await Promise.all([
        replaceOptions("sizes", id!, sizes.value()),
        replaceOptions("colors", id!, colors.value()),
        replaceOptions("details", id!, details.value()),
        replaceOptions("includes", id!, includes.value()),
      ]);
      toast("Saved");
      ctx.refreshBadges();
    } catch (err) {
      messages.appendChild(banner(friendlyError(err, "save this product")));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = isNew ? "Create product" : "Save changes";
    }
  });

  const actions = h("div", { style: "display:flex;gap:12px;flex-wrap:wrap;margin-top:20px;align-items:center;" }, [
    saveBtn,
    h("a", { class: "a-btn a-btn--ghost", href: "#/products", text: "Cancel" }),
  ]);

  if (!isNew) {
    actions.appendChild(h("div", { style: "flex:1;" }));
    actions.appendChild(h("button", {
      class: "a-btn a-btn--danger", text: "Delete product",
      onclick: async () => {
        if (!await confirmAction(
          `Delete “${p.name}” for good? Its photos and options go too. This cannot be undone.`,
          "Delete product")) return;
        try { await deleteProduct(id!); toast("Product deleted"); ctx.go("#/products"); }
        catch (err) { toast(friendlyError(err, "delete this product"), "err"); }
      },
    }));
  }
  root.appendChild(actions);
}

route(/^#\/products\/new$/, (ctx) => editor(ctx, null));
route(/^#\/products\/([0-9a-fA-F-]{36})$/, (ctx, params) => editor(ctx, params[0]));
