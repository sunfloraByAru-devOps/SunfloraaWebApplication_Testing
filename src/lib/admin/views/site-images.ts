/* Photos on the home page — the community wall and Aru's own portrait.
 *
 * These used to be hardcoded arrays in LandingFounder.astro, with her photo
 * hot-linked from a WhatsApp CDN URL that carried an expiry signature. Nobody
 * could change either without a code change, and the portrait was going to
 * disappear on its own.
 *
 * The screen is driven entirely by site_image_groups, so adding a future group
 * of pictures is one row of SQL and no code at all. */

import { route, type ViewCtx } from "../app";
import {
  listSiteImageGroups, listSiteImages, addSiteImage, updateSiteImage,
  deleteSiteImage, saveSiteImageOrder, prettyBytes, SITE_BUCKET,
  type SiteImageGroup, type SiteImage,
} from "../api";
import {
  h, clear, banner, friendlyError, field, toast, confirmAction, spinner, emptyState,
} from "../ui";
import { photoImg } from "../images";

/* ---------------- index: one card per group ---------------- */

route(/^#\/site-images$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let groups: SiteImageGroup[];
  try { groups = await listSiteImageGroups(); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "load your home page photos"))); return; }

  clear(root);
  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Photos on the home page" }),
      h("p", { class: "a-sub",
        text: "The pictures customers see before they reach the shop." }),
    ]),
  ]));

  if (!groups.length) {
    root.appendChild(emptyState("Nothing to manage yet",
      "No picture groups have been set up."));
    return;
  }

  const list = h("div", { class: "a-rows" });
  for (const g of groups) {
    let count = 0;
    try { count = (await listSiteImages(g.key)).filter((i) => i.is_active).length; }
    catch { /* a count is a nicety; never block the page */ }

    list.appendChild(h("div", { class: "a-rowitem" }, [
      h("div", { class: "a-rowitem__main" }, [
        h("strong", { text: g.label }),
        h("p", { class: "a-sub", text: g.blurb ?? "" }),
        h("p", { class: "a-hint",
          text: count === 0
            ? "No photo yet."
            : g.is_singleton ? "1 photo." : `${count} photo${count === 1 ? "" : "s"}.` }),
      ]),
      h("div", { class: "a-rowitem__actions" }, [
        h("a", { class: "a-btn a-btn--sm", href: `#/site-images/${g.key}`,
          text: count === 0 ? "Add a photo" : "Change" }),
      ]),
    ]));
  }
  root.appendChild(list);
});

/* ---------------- one group ---------------- */

route(/^#\/site-images\/([A-Za-z0-9_-]+)$/, async (ctx: ViewCtx, params: string[]) => {
  const { root } = ctx;
  const key = params[0];

  let group: SiteImageGroup | undefined;
  let images: SiteImage[] = [];
  try {
    const groups = await listSiteImageGroups();
    group = groups.find((g) => g.key === key);
    if (!group) { clear(root); root.appendChild(banner("That group of photos does not exist.", "warn")); return; }
    images = await listSiteImages(key);
  } catch (err) {
    clear(root); root.appendChild(banner(friendlyError(err, "load those photos"))); return;
  }
  const g = group;

  clear(root);
  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: g.label }),
      h("p", { class: "a-sub", text: g.blurb ?? "" }),
    ]),
    h("a", { class: "a-btn a-btn--ghost a-btn--sm", href: "#/site-images", text: "Back" }),
  ]));

  const grid = h("div", { class: "a-photos" });
  const summary = h("p", { class: "a-hint" });

  const active = () => images.filter((i) => i.is_active);

  /* ---- the editing sheet for one photo ---- */
  const openSheet = (img: SiteImage) => {
    const alt = h("input", { class: "a-input", value: img.alt }) as HTMLInputElement;
    const caption = h("textarea", { class: "a-input", rows: "3" }) as HTMLTextAreaElement;
    caption.value = img.caption ?? "";

    const done = () => overlay.remove();
    const overlay = h("div", {
      style: "position:fixed;inset:0;background:rgba(92,61,46,.4);display:flex;" +
             "align-items:center;justify-content:center;padding:20px;z-index:90;overflow:auto;",
      onclick: (e: MouseEvent) => { if (e.target === overlay) done(); },
    }, [
      h("div", { class: "a-card", style: "max-width:460px;width:100%;" }, [
        (() => {
          const preview = photoImg(img.storage_path, img.alt, "", SITE_BUCKET);
          preview.style.cssText =
            "width:100%;max-height:320px;object-fit:contain;" +
            "border-radius:12px;background:var(--a-bg-alt);";
          return preview;
        })(),
        h("div", { style: "margin-top:14px;" }, [
          field("Describe this photo", alt,
            "Read aloud to people who can't see it, and used by Google."),
          g.wants_caption
            ? field("Words shown with it", caption, "The short quote under the photo.")
            : null,
        ]),
        h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;" }, [
          h("button", {
            class: "a-btn a-btn--danger a-btn--sm", text: "Delete this photo",
            onclick: async () => {
              if (!await confirmAction(
                "Delete this photo? It will disappear from the home page the next time you publish.",
                "Delete photo")) return;
              try {
                await deleteSiteImage(img);
                images = images.filter((q) => q.id !== img.id);
                await saveSiteImageOrder(active());
                done(); draw(); toast("Photo deleted");
                ctx.refreshBadges();
              } catch (err) { toast(friendlyError(err, "delete that photo"), "err"); }
            },
          }),
          h("div", { style: "flex:1;" }),
          h("button", {
            class: "a-btn a-btn--sm", text: "Done",
            onclick: async () => {
              const patch: Partial<SiteImage> = {};
              const nextAlt = alt.value.trim();
              const nextCap = g.wants_caption ? caption.value.trim() : null;
              if (nextAlt !== img.alt) patch.alt = nextAlt;
              if (g.wants_caption && nextCap !== (img.caption ?? "")) {
                patch.caption = nextCap || null;
              }
              if (Object.keys(patch).length) {
                try {
                  await updateSiteImage(img.id, patch);
                  Object.assign(img, patch);
                  toast("Saved");
                  ctx.refreshBadges();
                } catch (err) { toast(friendlyError(err, "save that"), "err"); return; }
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

  /* ---- the grid ---- */
  const draw = () => {
    clear(grid);
    const shown = active();

    if (!shown.length) {
      grid.appendChild(h("p", { class: "a-sub", style: "grid-column:1/-1;",
        text: g.is_singleton
          ? "No photo yet. Add one and it will appear on the home page."
          : "No photos yet. Add a few and they will scroll across the home page." }));
    }

    shown.forEach((img, index) => {
      const missingAlt = !img.alt || !img.alt.trim();
      const card = h("div", {
        class: "a-photo",
        draggable: g.is_singleton ? null : "true",
        dataset: { index: String(index) },
        onclick: () => openSheet(img),
        tabindex: "0", role: "button",
        "aria-label": `Photo ${index + 1}`,
      }, [
        photoImg(img.storage_path, img.alt, "", SITE_BUCKET),
        missingAlt ? h("span", { class: "a-photo__warn", title: "No description written", text: "!" }) : null,
      ]);

      card.addEventListener("keydown", (e) => {
        const k = (e as KeyboardEvent).key;
        if (k === "Enter" || k === " ") { e.preventDefault(); openSheet(img); }
      });

      if (!g.is_singleton) {
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
          const order = active();
          const [moved] = order.splice(from, 1);
          order.splice(index, 0, moved);
          images = [...order, ...images.filter((i) => !i.is_active)];
          draw();
          try { await saveSiteImageOrder(order); toast("Order saved"); }
          catch (err) { toast(friendlyError(err, "save the new order"), "err"); }
        });
      }

      grid.appendChild(card);
    });

    const noAlt = shown.filter((i) => !i.alt || !i.alt.trim()).length;
    const cap = g.max_items;
    summary.textContent = !shown.length ? "" :
      (g.is_singleton
        ? "Tap the photo to change how it is described, or to replace it."
        : `${shown.length} photo${shown.length === 1 ? "" : "s"}. Drag to reorder.`) +
      (noAlt ? ` ${noAlt} still needs a description.` : "") +
      (!g.is_singleton && cap ? ` Room for ${Math.max(0, cap - shown.length)} more.` : "");

    zone.hidden = !!(cap && shown.length >= cap && !g.is_singleton);
    atCap.hidden = !zone.hidden;
  };

  /* ---- upload ---- */
  const fileInput = h("input", {
    type: "file", accept: "image/*", multiple: !g.is_singleton, class: "a-sr",
  }) as HTMLInputElement;

  const zone = h("div", {
    class: "a-dropzone", tabindex: "0", role: "button",
    "aria-label": g.is_singleton ? "Replace photo" : "Add photos",
  }, [
    h("div", { style: "font-size:1.6rem;", text: "📷" }),
    h("div", { style: "font-weight:600;color:var(--a-head);margin-top:4px;",
      text: g.is_singleton
        ? "Drop a photo here, or tap to choose"
        : "Drop photos here, or tap to choose" }),
    h("div", { class: "a-hint",
      text: g.aspect_hint === "square"
        ? "Straight off your phone is fine. It is shown as a square, so keep the subject centred."
        : "Straight off your phone is fine — we shrink them for you." }),
  ]);

  /* Every picture here is downloaded and re-encoded during each publish, so an
     unbounded gallery makes every price change slower. The cap lives in the
     database with the group, and this is where it is felt. */
  const atCap = h("p", { class: "a-hint", hidden: true,
    text: `That's the most photos this section can hold. Delete one to add another.` });

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) { toast("Please choose an image file.", "err"); return; }

    const room = g.is_singleton
      ? 1
      : g.max_items ? Math.max(0, g.max_items - active().length) : list.length;
    if (room <= 0) { toast("Delete a photo before adding another.", "err"); return; }
    const take = list.slice(0, room);
    if (take.length < list.length) {
      toast(`Only ${take.length} of ${list.length} photos fit — the rest were skipped.`, "err");
    }

    let saved = 0, added = 0;
    for (const file of take) {
      const placeholder = h("div", { class: "a-photo" }, [spinner()]);
      grid.appendChild(placeholder);
      try {
        const created = await addSiteImage(
          g.key, file, active().length,
          // A blank description is a regression, so start from something true
          // and let her sharpen it in the sheet.
          g.is_singleton ? "Aru Jaiswal, founder of Sunflora" : "A Sunflora piece in a customer's home",
          null,
        );
        /* A singleton's database trigger has just retired the previous row, so
           reflect that here rather than showing two portraits until a reload. */
        if (g.is_singleton) images = images.map((i) => ({ ...i, is_active: false }));
        images.unshift(created);
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

  const card = h("div", { class: "a-card" }, [zone, fileInput, atCap, grid, summary]);
  root.appendChild(card);
  draw();
});
