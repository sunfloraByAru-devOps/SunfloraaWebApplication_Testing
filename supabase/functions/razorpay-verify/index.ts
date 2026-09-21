import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, json } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  captureRazorpayPayment,
  fetchRazorpayPayment,
  razorpayConfigured,
  toPaise,
  verifyPaymentSignature,
} from "../_shared/razorpay.ts";

/* Step 3 of checkout: Razorpay Checkout's success handler posts what it was
 * given straight back here.
 *
 * Everything in that payload comes from the browser, so none of it is trusted
 * on its face. Two independent checks have to pass before an order is marked
 * paid:
 *   1. the HMAC signature, which only the holder of the API secret could have
 *      produced for this (order_id, payment_id) pair; and
 *   2. a server-to-server read of the payment itself, confirming it belongs to
 *      this Razorpay order, is captured (or authorized, which we then capture)
 *      and is for the full amount.
 *
 * The webhook does the same job for shoppers who close the tab before this
 * call lands. Both paths are idempotent. */

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: {
    order_id?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return json({ error: "Incomplete payment confirmation" }, 400);
  }
  if (!razorpayConfigured) {
    return json({ error: "Payments are not configured" }, 500);
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", order_id)
    .single();
  if (error || !order) return json({ error: "Order not found" }, 404);

  // Already settled (most likely by the webhook getting here first).
  if (order.payment_status === "paid") {
    return json({ payment_status: "paid", order_number: order.order_number });
  }

  if (order.razorpay_order_id && order.razorpay_order_id !== razorpay_order_id) {
    console.error(
      "razorpay-verify: razorpay_order_id mismatch for order",
      order.order_number,
    );
    return json({ error: "Payment does not belong to this order" }, 400);
  }

  const signatureValid = await verifyPaymentSignature({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!signatureValid) {
    console.error("razorpay-verify: signature check FAILED for", order.order_number);
    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "failed",
        payment_response: {
          stage: "verify",
          razorpay_order_id,
          razorpay_payment_id,
          _signature_valid: false,
        },
      })
      .eq("id", order.id);
    return json({ error: "Payment could not be verified" }, 400);
  }

  // Signature is genuine — now confirm with Razorpay what the payment actually is.
  const fetched = await fetchRazorpayPayment(razorpay_payment_id);
  if (!fetched.ok) {
    console.error("razorpay-verify: could not fetch payment", fetched.error);
    return json({ error: "Could not confirm the payment with Razorpay" }, 502);
  }

  let payment = fetched.data;
  const expectedPaise = toPaise(order.total);

  if (payment.order_id !== razorpay_order_id || payment.amount !== expectedPaise) {
    console.error(
      "razorpay-verify: payment does not match order",
      order.order_number,
      { paymentOrder: payment.order_id, amount: payment.amount, expectedPaise },
    );
    return json({ error: "Payment does not match this order" }, 400);
  }

  /* Accounts set to manual capture leave the payment "authorized": the money is
   * held but not taken. Capture it here so the two capture settings behave the
   * same way rather than silently leaving orders unpaid. */
  if (payment.status === "authorized") {
    const captured = await captureRazorpayPayment(razorpay_payment_id, expectedPaise);
    if (captured.ok) payment = captured.data;
    else console.error("razorpay-verify: capture failed", captured.error);
  }

  if (payment.status !== "captured") {
    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: payment.status === "failed" ? "failed" : "pending",
        razorpay_payment_id,
        payment_response: payment as unknown as Record<string, unknown>,
      })
      .eq("id", order.id);
    return json(
      { payment_status: payment.status, error: "Payment is not complete yet" },
      402,
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "paid",
      status: order.status === "pending" ? "confirmed" : order.status,
      payment_method: "razorpay",
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_bank_txn_id:
        (payment.acquirer_data as Record<string, string> | null)?.bank_transaction_id ||
        (payment.acquirer_data as Record<string, string> | null)?.rrn ||
        null,
      payment_response: payment as unknown as Record<string, unknown>,
      paid_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (updateErr) {
    console.error(updateErr);
    return json({ error: "Payment succeeded but the order could not be updated" }, 500);
  }

  // The pending -> confirmed status change fires the DB webhook, which sends
  // the "your order is confirmed" email. Nothing to send from here.
  return json({
    payment_status: "paid",
    order_number: order.order_number,
    email: order.guest_email,
  });
});
