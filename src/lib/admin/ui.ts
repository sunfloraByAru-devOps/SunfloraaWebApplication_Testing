/* Small DOM + formatting helpers for the admin.
   Rule for this whole folder: Aru never sees a raw database error, a column
   name, or an id. Anything technical is translated here. */

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, any> = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = String(v);
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === "dataset") {
      Object.assign((el as HTMLElement).dataset, v);
    } else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(node: HTMLElement) { while (node.firstChild) node.removeChild(node.firstChild); }

/* ---------- money & dates ---------- */

export function rupees(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function relativeDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate(iso);
}

/* ---------- plain-English errors ---------- */

/** Turn anything thrown by Supabase into a sentence Aru can act on. */
export function friendlyError(err: any, context = "save that"): string {
  const code = err?.code ?? "";
  const msg = String(err?.message ?? "");

  if (!navigator.onLine) {
    return "You appear to be offline. Check your connection and try again.";
  }
  // Session expired / not allowed.
  if (code === "42501" || /row-level security|permission denied|JWT|not authorized/i.test(msg)) {
    return "You are not signed in any more, or you do not have permission. " +
           "Try signing out and back in.";
  }
  if (code === "23505" || /duplicate key/i.test(msg)) {
    return "Something with that name already exists. Try a different one.";
  }
  if (code === "23503") {
    return "That is still being used somewhere else, so it cannot be removed yet.";
  }
  if (code === "23502") {
    return "Something required was left blank. Please fill in every box marked required.";
  }
  if (code === "22P02" || /invalid input/i.test(msg)) {
    return "One of the values does not look right. Please check and try again.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (/payload too large|exceeded the maximum|file size/i.test(msg)) {
    return "That file is too large. Please use a photo under 5 MB.";
  }
  if (/mime type|not supported/i.test(msg)) {
    return "That file type is not supported. Please use a JPG, PNG or WebP photo.";
  }
  return `Sorry — could not ${context} just now. Please try again in a moment.`;
}

/* ---------- toast ---------- */

let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;

export function toast(message: string, kind: "ok" | "err" = "ok") {
  if (!toastEl) {
    toastEl = h("div", { class: "a-toast", role: "status", "aria-live": "polite" });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = "a-toast is-on" + (kind === "err" ? " a-toast--err" : "");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.className = "a-toast" + (kind === "err" ? " a-toast--err" : "");
  }, kind === "err" ? 5200 : 2600);
}

/** Flash "Saved" (or an error) next to an inline control. */
export function flashSaved(target: HTMLElement, ok = true) {
  target.textContent = ok ? "Saved" : "Not saved";
  target.className = "a-saved is-on" + (ok ? "" : " is-err");
  window.setTimeout(() => { target.className = "a-saved" + (ok ? "" : " is-err"); }, 1900);
}

/* ---------- confirm ---------- */

export function confirmAction(question: string, confirmLabel = "Yes, do it"): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => { overlay.remove(); resolve(v); };
    const overlay = h("div", {
      style: "position:fixed;inset:0;background:rgba(92,61,46,.4);display:flex;" +
             "align-items:center;justify-content:center;padding:20px;z-index:90;",
      onclick: (e: MouseEvent) => { if (e.target === overlay) done(false); },
    }, [
      h("div", { class: "a-card", style: "max-width:400px;width:100%;" }, [
        h("p", { text: question, style: "margin:0 0 18px;color:var(--a-head);font-weight:500;" }),
        h("div", { style: "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;" }, [
          h("button", { class: "a-btn a-btn--ghost", text: "Cancel", onclick: () => done(false) }),
          h("button", { class: "a-btn a-btn--danger", text: confirmLabel, onclick: () => done(true) }),
        ]),
      ]),
    ]);
    document.body.appendChild(overlay);
  });
}

/* ---------- building blocks ---------- */

export function spinner() { return h("div", { class: "a-spinner", role: "status", "aria-label": "Loading" }); }

export function emptyState(title: string, note: string, action?: HTMLElement) {
  return h("div", { class: "a-empty" }, [
    h("h3", { text: title }),
    h("p", { text: note, class: "a-sub" }),
    action ?? null,
  ]);
}

export function banner(message: string, kind: "err" | "ok" | "warn" = "err") {
  return h("div", { class: `a-banner a-banner--${kind}`, text: message });
}

export function field(label: string, control: HTMLElement, hint?: string) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return h("div", { class: "a-field" }, [
    h("label", { class: "a-label", for: id, text: label }),
    control,
    hint ? h("p", { class: "a-hint", text: hint }) : null,
  ]);
}

export function toggle(label: string, checked: boolean, onChange: (v: boolean) => void) {
  const input = h("input", { type: "checkbox", checked });
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "a-toggle" }, [
    input,
    h("span", { class: "a-track" }),
    h("span", { class: "a-toggle-label", text: label }),
  ]);
}
