import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, json } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  RAZORPAY_KEY_ID,
  createRazorpayOrder,
  isTestMode,
  razorpayConfigured,
  toPaise,
} from "../_shared/razorpay.ts";

/* Step 2 of checkout: our `orders` row already exists (create-order made it,
 * payment_status = pending); this turns it into a Razorpay order and hands the
 * browser everything Razorpay Checkout needs to open.
 *
 * Unlike the Paytm function this replaces, there is no "gateway not configured
 * so mark it paid" fallback. That fallback marked real orders paid when no
 * money had moved; with rzp_test_* keys there is a proper test mode, so the
 * only honest answer to missing credentials is an error. */

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.order_id) return json({ error: "order_id is required" }, 400);

  if (!razorpayConfigured) {
    console.error("razorpay-initiate: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
    return json({ error: "Payments are not configured yet. Please try again later." }, 500);
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", body.order_id)
    .single();

  if (error || !order) return json({ error: "Order not found" }, 404);
  if (order.payment_status === "paid") {
    return json({ error: "This order has already been paid for" }, 400);
  }

  const amountPaise = toPaise(order.total);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    // Razorpay's floor is ₹1.00.
    return json({ error: "Order total is not a chargeable amount" }, 400);
  }

  const created = await createRazorpayOrder({
    amountPaise,
    receipt: order.order_number,
    notes: {
      // The webhook matches on this rather than on orders.razorpay_order_id,
      // so a retry that overwrites that column cannot orphan an earlier attempt.
      db_order_id: order.id,
      order_number: order.order_number,
    },
  });

  if (!created.ok) {
    console.error("razorpay-initiate: could not create Razorpay order", created.error);
    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "failed",
        payment_response: { stage: "initiate", error: created.error },
      })
      .eq("id", order.id);
    return json(
      { error: created.error?.description || "Could not start payment" },
      502,
    );
  }

  const rzpOrder = created.data;

  const { error: updateErr } = await supabaseAdmin
    .from("orders")
    .update({
      razorpay_order_id: rzpOrder.id,
      payment_method: "razorpay",
      payment_status: "pending",
    })
    .eq("id", order.id);
  if (updateErr) {
    console.error(updateErr);
    return json({ error: "Could not start payment" }, 500);
  }

  return json({
    key_id: RAZORPAY_KEY_ID,
    razorpay_order_id: rzpOrder.id,
    amount: rzpOrder.amount,
    currency: rzpOrder.currency,
    is_test_mode: isTestMode,
    order_id: order.id,
    order_number: order.order_number,
    prefill: {
      name: order.guest_name || "",
      email: order.guest_email || "",
      contact: order.guest_phone || "",
    },
  });
});
