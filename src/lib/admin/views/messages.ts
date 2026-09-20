/* Messages & newsletter — a simple inbox, and a list she can export. */

import { route, type ViewCtx } from "../app";
import {
  listMessages, setMessageStatus, listSubscribers,
  MESSAGE_STATUSES, MESSAGE_STATUS_LABEL, TOPIC_LABEL,
} from "../api";
import { h, clear, banner, friendlyError, relativeDay, toast, emptyState } from "../ui";

route(/^#\/messages$/, async (ctx: ViewCtx) => {
  const { root } = ctx;
  let messages: any[], subs: any[];
  try { [messages, subs] = await Promise.all([listMessages(), listSubscribers().catch(() => [])]); }
  catch (err) { clear(root); root.appendChild(banner(friendlyError(err, "load your messages"))); return; }

  clear(root);
  const unread = messages.filter((m) => m.status === "new" || m.status === "read");

  root.appendChild(h("div", { class: "a-page-head" }, [
    h("div", { class: "a-grow" }, [
      h("h1", { text: "Messages" }),
      h("p", { class: "a-sub", text: unread.length
        ? `${unread.length} still to deal with` : "All dealt with" }),
    ]),
  ]));

  const list = h("div", { class: "a-rows" });
  root.appendChild(list);

  const draw = () => {
    clear(list);
    if (!messages.length) {
      list.appendChild(emptyState("No messages", "Anything sent through the contact form appears here."));
      return;
    }
    const ordered = [...messages].sort((a, b) =>
      Number(["replied", "closed"].includes(a.status)) - Number(["replied", "closed"].includes(b.status)) ||
      (b.created_at || "").localeCompare(a.created_at || ""));

    for (const m of ordered) {
      const done = ["replied", "closed"].includes(m.status);
      const sel = h("select", { class: "a-select", style: "max-width:150px;" }) as HTMLSelectElement;
      for (const s of MESSAGE_STATUSES) {
        const o = h("option", { value: s, text: MESSAGE_STATUS_LABEL[s] }) as HTMLOptionElement;
        if (s === m.status) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener("change", async () => {
        try { await setMessageStatus(m.id, sel.value); m.status = sel.value; toast("Saved"); ctx.refreshBadges(); draw(); }
        catch (err) { sel.value = m.status; toast(friendlyError(err, "save that"), "err"); }
      });

      list.appendChild(h("div", { class: "a-card", style: done ? "opacity:.72;" : "" }, [
        h("div", { style: "display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;" }, [
          h("div", { style: "flex:1;min-width:200px;" }, [
            h("h3", { text: m.name || "Someone" }),
            h("p", { class: "a-sub", style: "margin:2px 0 0;", text:
              `${TOPIC_LABEL[m.topic] ?? m.topic ?? "Message"} · ${relativeDay(m.created_at)}` }),
          ]),
          sel,
        ]),
        m.subject ? h("p", { style: "margin:12px 0 0;font-weight:600;color:var(--a-head);", text: m.subject }) : null,
        m.message ? h("p", { style: "margin:8px 0 0;white-space:pre-wrap;", text: m.message }) : null,
        m.email ? h("p", { style: "margin:12px 0 0;" }, [
          h("a", { class: "a-btn a-btn--ghost a-btn--sm", href: `mailto:${m.email}`, text: "Reply by email" }),
        ]) : null,
      ]));
    }
  };
  draw();

  /* newsletter */
  const exportCsv = () => {
    const rows = [["email", "subscribed"], ...subs.map((s) => [s.email, s.is_active ? "yes" : "no"])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = h("a", { href: url, download: `sunflora-newsletter-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  root.appendChild(h("div", { class: "a-card", style: "margin-top:22px;" }, [
    h("h2", { text: "Newsletter", style: "margin-bottom:8px;" }),
    h("p", { class: "a-sub", text: `${subs.filter((s) => s.is_active).length} people subscribed` }),
    h("button", { class: "a-btn a-btn--ghost", text: "Download the list",
      style: "margin-top:12px;", disabled: !subs.length, onclick: exportCsv }),
  ]));
});
