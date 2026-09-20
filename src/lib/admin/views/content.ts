/* Site content — the questions, quotes and wording on the public pages. */

import { route, type ViewCtx } from "../app";
import {
  CONTENT, listContent, saveContent, deleteContent, listSettings, saveSetting,
} from "../api";
import {
  h, clear, banner, friendlyError, toast, confirmAction, toggle, flashSaved, emptyState, field,
} from "../ui";

function editorCard(kind: keyof typeof CONTENT, row: any | null, onDone: () => void) {
  const spec = CONTENT[kind];
  const inputs: Record<string, any> = {};
  const body = h("div");

  for (const f of spec.fields) {
    if (f.type === "toggle") continue;
    const el = f.type === "textarea"
      ? h("textarea", { class: "a-textarea" }) as HTMLTextAreaElement
      : h("input", { class: "a-input", type: f.type === "number" ? "number" : "text" }) as HTMLInputElement;
    (el as any).value = row?.[f.key] ?? "";
    inputs[f.key] = el;
    body.appendChild(field(f.label, el, f.hint));
  }

  let active = row ? !!row.is_active : true;
  body.appendChild(h("div", { style: "margin-bottom:16px;" },
    [toggle("Show on site", active, (v) => { active = v; })]));

  const save = h("button", { class: "a-btn", text: row ? "Save changes" : `Add ${spec.singular}` }) as HTMLButtonElement;
  save.addEventListener("click", async () => {
    const patch: any = { is_active: active };
    for (const f of spec.fields) {
      if (f.type === "toggle") continue;
      const v = (inputs[f.key] as any).value;
      patch[f.key] = f.type === "number" ? (v === "" ? null : Number(v)) : String(v).trim();
    }
    const firstRequired = spec.fields.find((f) => f.type !== "toggle" && !f.hint);
    if (firstRequired && !patch[firstRequired.key]) {
      toast(`Please fill in “${firstRequired.label}”.`, "err"); return;
    }
    save.disabled = true;
    try { await saveContent(kind, row?.id ?? null, patch); toast("Saved"); onDone(); }
    catch (err) { save.disabled = false; toast(friendlyError(err, "save that"), "err"); }
  });

  body.appendChild(h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;" }, [
    save,
    h("button", { class: "a-btn a-btn--ghost", text: "Cancel", onclick: onDone }),
  ]));
  return body;
}

function contentSection(kind: keyof typeof CONTENT, root: HTMLElement) {
  const spec = CONTENT[kind];
  const wrap = h("div", { style: "margin-bottom:28px;" });
  root.appendChild(wrap);

  const render = async () => {
    clear(wrap);
    wrap.appendChild(h("h2", { text: spec.title, style: "margin-bottom:12px;" }));
    let rows: any[];
    try { rows = await listContent(kind); }
    catch (err) { wrap.appendChild(banner(friendlyError(err, "load that"))); return; }

    if (!rows.length) {
      wrap.appendChild(emptyState(`No ${spec.title.toLowerCase()} yet`, ""));
    }

    for (const row of rows) {
      const saved = h("span", { class: "a-saved" });
      const headline = spec.fields[0].key;
      const card = h("div", { class: "a-rowitem" }, [
        h("div", { class: "a-rowitem__main" }, [
          h("div", { class: "a-rowitem__name", text: row[headline] || "—" }),
          h("div", { class: "a-rowitem__meta", text:
            String(row[spec.fields[1]?.key] ?? "").slice(0, 80) }),
        ]),
        h("div", { class: "a-rowitem__actions" }, [
          toggle("Show on site", row.is_active, async (v) => {
            try { await saveContent(kind, row.id, { is_active: v }); row.is_active = v; flashSaved(saved, true); }
            catch (err) { flashSaved(saved, false); toast(friendlyError(err, "save that"), "err"); }
          }),
          saved,
          h("button", { class: "a-btn a-btn--ghost a-btn--sm", text: "Edit",
            onclick: () => {
              const slot = h("div", { class: "a-card", style: "margin-top:10px;" },
                [editorCard(kind, row, render)]);
              card.after(slot);
            } }),
          h("button", { class: "a-btn a-btn--danger a-btn--sm", text: "Delete",
            onclick: async () => {
              if (!await confirmAction(`Delete this ${spec.singular}? This cannot be undone.`, "Delete")) return;
              try { await deleteContent(kind, row.id); toast("Deleted"); render(); }
              catch (err) { toast(friendlyError(err, "delete that"), "err"); }
            } }),
        ]),
      ]);
      wrap.appendChild(card);
    }

    const addBtn = h("button", { class: "a-btn a-btn--ghost", text: `+ Add a ${spec.singular}`,
      style: "margin-top:12px;" });
    addBtn.addEventListener("click", () => {
      addBtn.replaceWith(h("div", { class: "a-card" }, [editorCard(kind, null, render)]));
    });
    wrap.appendChild(addBtn);
  };
  void render();
}

route(/^#\/content$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  clear(root);
  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Questions & quotes" }),
      h("p", { class: "a-sub", text: "Your FAQ answers and the customer quotes on your site." }),
    ]),
  ]));

  contentSection("faqs", root);
  contentSection("testimonials", root);

});

/* Shop details — the handful of settings that appear on the public pages. */
route(/^#\/settings$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  clear(root);
  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Shop details" }),
      h("p", { class: "a-sub", text: "Contact details and wording used across your site." }),
    ]),
  ]));

  let settings: any[];
  try { settings = await listSettings(); }
  catch (err) { root.appendChild(banner(friendlyError(err, "load your shop details"))); return; }

  // An internal bookkeeping row the dashboard writes; not hers to edit.
  const shown = settings.filter((s) => s.key !== "content_changed_at");
  if (!shown.length) {
    root.appendChild(emptyState("Nothing to change here", ""));
    return;
  }

  const list = h("div", { class: "a-rows" });
  for (const s of shown) {
    const saved = h("span", { class: "a-saved" });
    const input = h("input", { class: "a-input", value: s.value ?? "",
      "aria-label": s.label || s.key }) as HTMLInputElement;
    input.addEventListener("change", async () => {
      try { await saveSetting(s.key, input.value); flashSaved(saved, true); ctx.refreshBadges(); }
      catch (err) { flashSaved(saved, false); toast(friendlyError(err, "save that"), "err"); }
    });
    list.appendChild(h("div", { class: "a-rowitem" }, [
      h("div", { class: "a-rowitem__main" }, [
        h("div", { class: "a-label", style: "margin-bottom:6px;",
          text: s.label || s.key.replace(/_/g, " ") }),
        input,
      ]),
      saved,
    ]));
  }
  root.appendChild(list);
});
