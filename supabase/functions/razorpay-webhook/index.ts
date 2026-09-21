import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  verifyWebhookSignature,
  webhookSecretConfigured,
  toPaise,
} from "../_shared/razorpay.ts";
import { sendMail } from "../_shared/mailer.ts";
import { SITE_URL, wrapEmail, money } from "../_shared/emailTemplates.ts";

/* Razorpay's server-to-server notification, and the reason an order still gets
 * settled when the shopper closes the tab the instant after paying — the point
 * at which the old Paytm callback's browser redirect was the *only* thing that
 * could mark an order paid.
 *
 * Deployed with --no-verify-jwt: Razorpay sends no Supabase JWT. Its
 * X-Razorpay-Signature over the raw body is the authentication, so the body is
 * read as text first and parsed only after that HMAC checks out.
 *
 * Dashboard -> Settings -> Webhooks:
 *   URL     <SUPABASE_URL>/functions/v1/razorpay-webhook
 *   Secret  the same string stored as RAZORPAY_WEBHOOK_SECRET
 *   Events  payment.captured, payment.failed, order.paid
 */

function ok(body: Record<string, unknown> = { received: true }) {
  // Always 200 on anything we have genuinely handled or deliberately ignored —
  // a non-2xx makes Razorpay retry, and retrying will not fix a stale event.
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!webhookSecretConfigured) {
    console.error("razorpay-webhook: RAZORPAY_WEBHOOK_SECRET is not set — rejecting");
    return new Response("Webhook not configured", { status: 500, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    console.error("razorpay-webhook: signature verification FAILED");
    return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const eventName: string = event?.event || "";
  const payment = event?.payload?.payment?.entity ?? null;
  const rzpOrder = event?.payload?.order?.entity ?? null;

  const razorpayOrderId: string | null =
    payment?.order_id ?? rzpOrder?.id ?? null;
  /* razorpay-initiate stamps our own order id into notes, so a retry that
   * overwrites orders.razorpay_order_id can't strand an earlier attempt. */
  const dbOrderId: string | null =
    payment?.notes?.db_order_id ?? rzpOrder?.notes?.db_order_id ?? null;

  let order: any = null;
  if (dbOrderId) {
    const { data } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", dbOrderId)
      .maybeSingle();
    order = data;
  }
  if (!order && razorpayOrderId) {
    const { data } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();
    order = data;
  }

  if (!order) {
    console.error("razorpay-webhook: no matching order for", eventName, razorpayOrderId);
    return ok({ received: true, matched: false });
  }

  if (eventName === "payment.captured" || eventName === "order.paid") {
    if (order.payment_status === "paid") return ok({ received: true, already_paid: true });

    const amount = payment?.amount ?? rzpOrder?.amount_paid;
    if (typeof amount === "number" && amount !== toPaise(order.total)) {
      console.error(
        "razorpay-webhook: amount mismatch for",
        order.order_number,
        { amount, expected: toPaise(order.total) },
      );
      return ok({ received: true, amount_mismatch: true });
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "paid",
        status: order.status === "pending" ? "confirmed" : order.status,
        payment_method: "razorpay",
        razorpay_order_id: razorpayOrderId ?? order.razorpay_order_id,
        razorpay_payment_id: payment?.id ?? order.razorpay_payment_id,
        payment_bank_txn_id:
          payment?.acquirer_data?.bank_transaction_id ??
          payment?.acquirer_data?.rrn ??
          order.payment_bank_txn_id ??
          null,
        payment_response: payment ?? rzpOrder,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    if (error) console.error(error);

    // pending -> confirmed fires the DB webhook, which sends the confirmation email.
    return ok();
  }

  if (eventName === "payment.failed") {
    // A failed attempt on an order that is already paid (the shopper's first
    // try failed, the second worked) must not undo the payment.
    if (order.payment_status === "paid") return ok({ received: true, already_paid: true });

    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "failed",
        razorpay_payment_id: payment?.id ?? order.razorpay_payment_id,
        payment_response: payment,
      })
      .eq("id", order.id);

    /* status doesn't change on a failed payment, so the DB webhook won't fire
     * here — the "it didn't go through, here's how to retry" email is sent
     * directly, exactly as the Paytm callback used to do. */
    if (order.guest_email) {
      await sendMail({
        to: order.guest_email,
        subject: `Payment failed for order ${order.order_number}`,
        html: wrapEmail(
          "Payment didn't go through",
          `<p>We couldn't complete the payment of <strong>${money(order.total)}</strong> for order <strong>${order.order_number}</strong>.</p>
           <p>Reason: ${payment?.error_description || "Payment was not successful"}.</p>
           <p>No amount has been charged. You can retry payment any time from your order tracking page:</p>
           <p><a href="${SITE_URL}/track-order?order=${order.order_number}&email=${encodeURIComponent(order.guest_email)}" style="color:#e0862f;">Retry payment</a></p>`,
        ),
      });
    }
    return ok();
  }

  return ok({ received: true, ignored: eventName });
});
