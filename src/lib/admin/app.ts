/* Admin shell: sign-in gate, navigation, and hash routing.
 *
 * The site is statically rendered, so this is a small client-side app under one
 * route. Row Level Security is the real protection - this gate only decides
 * what to draw, never what is permitted. */

import { supabase } from "../supabase";
import { sendMagicLink, signInWithPassword } from "../auth";
import { getAdminSession, signOut, getTodayCounts, type AdminSession } from "./api";
import { getPublishState } from "./health";
import { h, clear, spinner, banner, friendlyError, relativeDay, field } from "./ui";

export type ViewCtx = {
  root: HTMLElement;
  session: AdminSession;
  go: (hash: string) => void;
  refreshBadges: () => void;
};

type View = (ctx: ViewCtx, params: string[]) => void | Promise<void>;

const routes: { pattern: RegExp; view: View }[] = [];
export function route(pattern: RegExp, view: View) { routes.push({ pattern, view }); }

/* Four sections rather than one flat list of ten links - a flat nav is
   unusable on a phone, which is where Aru actually works. */
type NavItem = { href: string; label: string; badge?: string };
type Section = { key: string; label: string; items: NavItem[] };

const SECTIONS: Section[] = [
  { key: "today", label: "Today", items: [{ href: "#/", label: "Today" }] },
  { key: "shop", label: "Shop", items: [
    { href: "#/orders", label: "Orders", badge: "newOrders" },
    { href: "#/custom-orders", label: "Custom requests", badge: "customRequests" },
    { href: "#/messages", label: "Messages", badge: "unreadMessages" },
    { href: "#/customers", label: "Customers" },
  ]},
  { key: "catalog", label: "Catalog", items: [
    { href: "#/products", label: "Products" },
    { href: "#/photos", label: "Photos", badge: "photoIssues" },
    { href: "#/categories", label: "Categories" },
    { href: "#/reviews", label: "Reviews", badge: "pendingReviews" },
  ]},
  { key: "site", label: "Site", items: [
    { href: "#/content", label: "Questions & quotes" },
    { href: "#/settings", label: "Shop details" },
  ]},
];

function sectionFor(hash: string): Section {
  if (hash === "#/" || hash === "") return SECTIONS[0];
  for (const s of SECTIONS) {
    for (const it of s.items) {
      if (it.href !== "#/" && hash.startsWith(it.href)) return s;
    }
  }
  return SECTIONS[0];
}

let session: AdminSession | null = null;
let mount: HTMLElement;
let builtAt = "";

export function startAdmin(rootId: string, buildStamp: string) {
  const el = document.getElementById(rootId);
  if (!el) return;
  mount = el;
  builtAt = buildStamp;
  void boot();
  window.addEventListener("hashchange", () => { if (session) render(); });
}

async function boot() {
  clear(mount);
  mount.appendChild(spinner());
  let admin: AdminSession | null = null;
  try { admin = await getAdminSession(); }
  catch (err) { clear(mount); mount.appendChild(banner(friendlyError(err, "sign you in"))); return; }
  if (!admin) { renderLogin(); return; }
  session = admin;
  renderShell();
  render();
  void refreshBadges();
  void refreshPublishState();
}

/* ---------- sign in ---------- */

function renderLogin(message?: string, kind: "err" | "ok" = "err") {
  clear(mount);

  const email = h("input", { class: "a-input", type: "email", placeholder: "you@example.com",
    autocomplete: "username", required: true }) as HTMLInputElement;
  const password = h("input", { class: "a-input", type: "password", placeholder: "Your password",
    autocomplete: "current-password" }) as HTMLInputElement;
  const submit = h("button", { class: "a-btn", type: "submit", text: "Sign in",
    style: "width:100%;" }) as HTMLButtonElement;

  const linkBtn = h("button", { type: "button", class: "a-btn a-btn--quiet a-btn--sm",
    text: "Email me a sign-in link instead" }) as HTMLButtonElement;

  const busy = (on: boolean, label: string) => {
    submit.disabled = on; linkBtn.disabled = on;
    submit.textContent = on ? label : "Sign in";
  };

  const form = h("form", { class: "a-card" }, [
    h("h1", { text: "Sunflora" }),
    h("p", { class: "a-sub", text: "Sign in to manage your shop.", style: "margin-bottom:18px;" }),
    message ? banner(message, kind) : null,
    h("div", { style: "text-align:left;" }, [
      field("Email", email),
      field("Password", password),
    ]),
    submit,
    h("div", { style: "margin-top:14px;" }, [linkBtn]),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const address = email.value.trim();
    if (!address) { email.focus(); return; }
    if (!password.value) {
      renderLogin("Please enter your password, or ask for a sign-in link instead.");
      return;
    }
    busy(true, "Signing in…");
    try {
      const { error } = await signInWithPassword(address, password.value);
      if (error) throw error;
      // onAuthStateChange picks it up and boots the dashboard, which is also
      // where the admin-role check happens.
      await boot();
    } catch (err: any) {
      busy(false, "");
      const wrong = /invalid login credentials/i.test(String(err?.message ?? ""));
      renderLogin(wrong
        ? "That email and password don't match. Try again, or ask for a sign-in link."
        : friendlyError(err, "sign you in"));
    }
  });

  linkBtn.addEventListener("click", async () => {
    const address = email.value.trim();
    if (!address) { email.focus(); return; }
    busy(true, "Sending…");
    try {
      const { error } = await sendMagicLink(address, undefined, window.location.href);
      if (error) throw error;
      renderLogin(`Check ${address} for your sign-in link. You can close this page.`, "ok");
    } catch (err) {
      busy(false, "");
      renderLogin(friendlyError(err, "send that link"));
    }
  });

  mount.appendChild(h("div", { class: "a-login" }, [form]));
}

/* ---------- shell ---------- */

let viewRoot: HTMLElement;
let sectionNav: HTMLElement;
let itemNav: HTMLElement;
let publishBar: HTMLElement;

function renderShell() {
  clear(mount);
  sectionNav = h("nav", { class: "a-sections", "aria-label": "Sections" });
  itemNav = h("nav", { class: "a-nav", "aria-label": "Screens" });
  viewRoot = h("div", { class: "a-main" });
  publishBar = h("div", { hidden: true });

  const topbar = h("header", { class: "a-topbar" }, [
    h("a", { class: "a-brand", href: "#/", html: 'Sunflora <span>admin</span>' }),
    h("div", { class: "a-topbar-spacer" }),
    h("a", { class: "a-btn a-btn--quiet a-btn--sm", href: "/", target: "_blank", rel: "noopener",
      text: "View shop" }),
    h("button", { class: "a-btn a-btn--quiet a-btn--sm", text: "Sign out",
      onclick: async () => { await signOut(); session = null; renderLogin("You have been signed out.", "ok"); } }),
  ]);

  mount.appendChild(topbar);
  mount.appendChild(publishBar);
  mount.appendChild(sectionNav);
  mount.appendChild(itemNav);
  mount.appendChild(viewRoot);
  drawNav({});
}

let lastCounts: Record<string, number> = {};

function drawNav(counts: Record<string, number>) {
  const hash = location.hash || "#/";
  const active = sectionFor(hash);

  clear(sectionNav);
  for (const s of SECTIONS) {
    const n = s.items.reduce((t, it) => t + (it.badge ? (counts[it.badge] ?? 0) : 0), 0);
    sectionNav.appendChild(h("a", {
      href: s.items[0].href,
      class: s.key === active.key ? "is-active" : "",
      "aria-current": s.key === active.key ? "true" : null,
    }, [
      document.createTextNode(s.label),
      n > 0 ? h("span", { class: "a-pip", text: String(n) }) : null,
    ]));
  }

  clear(itemNav);
  // A one-screen section needs no second row.
  itemNav.hidden = active.items.length < 2;
  for (const it of active.items) {
    const n = it.badge ? (counts[it.badge] ?? 0) : 0;
    const on = hash === it.href || (it.href !== "#/" && hash.startsWith(it.href));
    itemNav.appendChild(h("a", {
      href: it.href,
      class: on ? "is-active" : "",
      "aria-current": on ? "page" : null,
    }, [
      document.createTextNode(it.label),
      n > 0 ? h("span", { class: "a-pip", text: String(n) }) : null,
    ]));
  }
}

export async function refreshBadges() {
  try {
    lastCounts = await getTodayCounts() as unknown as Record<string, number>;
    drawNav(lastCounts);
  } catch { /* badges are a nicety; never block the page */ }
}

/** Nothing Aru changes is on the live shop until the site is rebuilt. Say so. */
export async function refreshPublishState() {
  try {
    const state = await getPublishState(builtAt);
    clear(publishBar);
    publishBar.hidden = !state.pending;
    if (!state.pending) return;
    publishBar.className = "a-publish";
    publishBar.appendChild(h("span", { text: "Your changes aren't on the live shop yet." }));
    publishBar.appendChild(h("span", { class: "a-publish__when",
      text: `Last published ${relativeDay(state.builtAt).toLowerCase()}.` }));
  } catch { publishBar.hidden = true; }
}

/* ---------- routing ---------- */

function render() {
  if (!session) return;
  const hash = location.hash || "#/";
  drawNav(lastCounts);
  clear(viewRoot);

  const ctx: ViewCtx = {
    root: viewRoot,
    session,
    go: (to: string) => { location.hash = to; },
    refreshBadges: () => { void refreshBadges(); void refreshPublishState(); },
  };

  for (const r of routes) {
    const m = hash.match(r.pattern);
    if (m) {
      viewRoot.appendChild(spinner());
      Promise.resolve(r.view(ctx, m.slice(1))).catch((err) => {
        clear(viewRoot);
        viewRoot.appendChild(banner(friendlyError(err, "open that page")));
      });
      return;
    }
  }
  viewRoot.appendChild(banner("That page does not exist.", "warn"));
}

/* A sign-out elsewhere, or an expired session, should not leave a dead screen. */
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") { session = null; renderLogin("You have been signed out.", "ok"); }
  if (event === "SIGNED_IN" && !session) void boot();
});
