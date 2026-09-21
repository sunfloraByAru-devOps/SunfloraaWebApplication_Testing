/* Razorpay Checkout, shared by the checkout page and the "Retry Payment"
 * button on order tracking.
 *
 * This replaces the old Paytm flow, which built a hidden <form> from an
 * action_url + params the edge function returned and POSTed the shopper away
 * to a hosted page. Razorpay's checkout is a modal on our own page instead, so
 * there is no redirect and no hidden form — but that also means the browser is
 * the one telling us payment succeeded. It is never believed: the handler
 * payload goes to razorpay-verify, which re-checks the signature and the
 * payment against Razorpay's API before any order is marked paid.
 */

import { supabase } from "./supabase";

const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<void> | null = null;

/** Loads checkout.js once per page, and only when someone actually pays. */
function loadCheckoutScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay checkout needs a browser"));
  }
  if ((window as any).Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_JS}"]`,
    );
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      scriptPromise = null;
      reject(new Error("Could not load the payment window. Check your connection."));
    });
    if (!existing) {
      script.src = CHECKOUT_JS;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

export type PaymentOutcome =
  /** Verified by the server. The order is confirmed. */
  | { status: "paid"; orderNumber?: string; email?: string }
  /** Shopper closed the modal. The order still exists, unpaid. */
  | { status: "dismissed" }
  /** The attempt failed or could not be verified. */
  | { status: "failed"; message: string };

/**
 * Opens Razorpay Checkout for an existing `orders` row and resolves once the
 * shopper is done with it, one way or the other. Never rejects for an ordinary
 * payment outcome — only for the order genuinely not being payable.
 */
export async function payForOrder(
  dbOrderId: string,
  opts: { onVerifying?: () => void } = {},
): Promise<PaymentOutcome> {
  const { data: init, error: initErr } = await supabase.functions.invoke(
    "razorpay-initiate",
    { body: { order_id: dbOrderId } },
  );
  if (initErr || !init || init.error) {
    throw new Error(init?.error || initErr?.message || "Could not start payment");
  }
  if (!init.key_id || !init.razorpay_order_id) {
    throw new Error("Payment gateway is not available right now.");
  }

  await loadCheckoutScript();
  const Razorpay = (window as any).Razorpay;
  if (!Razorpay) throw new Error("Could not load the payment window.");

  return new Promise<PaymentOutcome>((resolve) => {
    // Checkout can fire more than one of these (a failure, then a dismiss);
    // the first outcome is the real one.
    let settled = false;
    const settle = (outcome: PaymentOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const rzp = new Razorpay({
      key: init.key_id,
      order_id: init.razorpay_order_id,
      amount: init.amount,
      currency: init.currency || "INR",
      name: "Sunflora Studio",
      description: `Order ${init.order_number}`,
      prefill: {
        name: init.prefill?.name || "",
        email: init.prefill?.email || "",
        contact: init.prefill?.contact || "",
      },
      notes: { order_number: init.order_number },
      theme: { color: "#D4708F" },
      modal: {
        ondismiss: () => settle({ status: "dismissed" }),
      },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        opts.onVerifying?.();
        try {
          const { data: verified, error: verifyErr } =
            await supabase.functions.invoke("razorpay-verify", {
              body: { order_id: dbOrderId, ...response },
            });
          if (verifyErr || !verified || verified.error) {
            /* The money may well have left the shopper's account here — the
             * webhook is what settles the order in that case, so the wording
             * must not claim the payment failed. */
            settle({
              status: "failed",
              message:
                verified?.error ||
                verifyErr?.message ||
                "We couldn't confirm your payment yet. If you were charged, your order will update shortly.",
            });
            return;
          }
          settle({
            status: "paid",
            orderNumber: verified.order_number || init.order_number,
            email: verified.email || init.prefill?.email,
          });
        } catch (e) {
          settle({
            status: "failed",
            message:
              "We couldn't confirm your payment yet. If you were charged, your order will update shortly.",
          });
        }
      },
    });

    rzp.on("payment.failed", (resp: any) => {
      settle({
        status: "failed",
        message:
          resp?.error?.description ||
          "The payment did not go through. No amount has been charged.",
      });
    });

    rzp.open();
  });
}
