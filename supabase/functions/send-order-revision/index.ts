/* send-order-revision
 *
 * Emails the customer when an admin changes the items on a placed order.
 *
 * Deliberately reuses the shop's existing _shared/mailer.ts (Gmail SMTP via
 * denomailer) and _shared/emailTemplates.ts, so this message looks and is sent
 * exactly like every other Sunflora email. No new provider, no new secrets.
 *
 * It reads the queue in public.order_notifications, which admin_revise_order
 * fills in the same transaction as the revision itself - so a mail can never
 * be lost because a network call failed. Safe to retry.
 *
 * Deploy: supabase functions deploy send-order-revision
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, json } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { sendMail } from "./_shared/mailer.ts";
import { SITE_URL, wrapEmail, money, BRAND_GOLD } from "./_shared/emailTemplates.ts";

type Item = { name: string; quantity: number; unit_price: number };

function itemsTable(items: Item[]): string {
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;font-family:Georgia,serif;font-size:14px;">
    ${(items ?? []).map((it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0e4d3;">
          ${it.name}<br/><span style="color:#9a8b7a;">Qty ${it.quantity}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f0e4d3;text-align:right;">${money(it.unit_price * it.quantity)}</td>
      </tr>`).join("")}
  </table>`;
}

function buildHtml(p: any, email: string): string {
  const wentUp = Number(p.total_after) > Number(p.total_before);
  const trackLink = `${SITE_URL}/track-order?order=${p.order_number}&email=${encodeURIComponent(email)}`;

  return wrapEmail("We've updated your order", `
    <p>Hi ${p.customer_name || "there"},</p>
    <p>We've made a change to order <strong>${p.order_number}</strong>. Here's exactly what it looks like now.</p>
    ${p.reason
      ? `<p style="margin-top:16px;padding:16px 18px;background:#FDF2E9;border-radius:10px;border:1px solid #E8D5C4;color:#5C3D2E;"><strong>Why:</strong> ${p.reason}</p>`
      : ""}
    ${itemsTable(p.items_after)}
    <p style="text-align:right;font-size:14px;margin:0;">Delivery: ${money(p.shipping_fee)}</p>
    ${Number(p.discount) > 0 ? `<p style="text-align:right;font-size:14px;margin:0;">Discount: −${money(p.discount)}</p>` : ""}
    <p style="text-align:right;font-size:16px;"><strong>New total: ${money(p.total_after)}</strong></p>
    <p style="font-size:13px;color:#9a8b7a;text-align:right;margin-top:-8px;">Previously ${money(p.total_before)}</p>
    <p>${wentUp
      ? "As the new total is higher, we'll be in touch about the difference before your order is dispatched."
      : "Any difference will be refunded to your original payment method."}</p>
    <p>If this doesn't look right, just reply to this email and we'll sort it out.</p>
    <p><a href="${trackLink}" style="color:${BRAND_GOLD};">View your order</a></p>`);
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    // Only an admin may trigger sending.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Not allowed" }, 403);

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("role").eq("id", uid).maybeSingle();
    if (profile?.role !== "admin") return json({ error: "Not allowed" }, 403);

    const body = await req.json().catch(() => ({}));

    let q = supabaseAdmin.from("order_notifications")
      .select("*").eq("status", "pending").limit(25);
    if (body?.order_id) q = q.eq("order_id", body.order_id);
    const { data: queued, error } = await q;
    if (error) throw error;

    let sent = 0, failed = 0;
    for (const row of queued ?? []) {
      try {
        if (!row.to_email) throw new Error("No email address on this order");
        const res = await sendMail({
          to: row.to_email,
          subject: `Your Sunflora order ${row.payload.order_number} has been updated`,
          html: buildHtml(row.payload, row.to_email),
        });
        if (!res.sent) throw new Error(res.error || (res.skipped ? "mail secrets not set" : "not sent"));

        await supabaseAdmin.from("order_notifications")
          .update({ status: "sent", sent_at: new Date().toISOString(), attempts: (row.attempts ?? 0) + 1 })
          .eq("id", row.id);
        sent++;
      } catch (e) {
        failed++;
        await supabaseAdmin.from("order_notifications")
          .update({ status: "failed", attempts: (row.attempts ?? 0) + 1, last_error: String(e).slice(0, 500) })
          .eq("id", row.id);
      }
    }

    return json({ sent, failed, considered: queued?.length ?? 0 });
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
