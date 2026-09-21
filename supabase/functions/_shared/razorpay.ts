/* Razorpay REST helpers.
 *
 * Replaces the old _shared/paytm.ts (AES-CBC checksum + hosted redirect page).
 * Razorpay is simpler: HTTP Basic auth with key_id:key_secret for the API, and
 * plain HMAC-SHA256 hex signatures for the two things the client can lie about
 * — the checkout handler payload and the webhook body.
 */

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") || "";
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "";

const API_BASE = "https://api.razorpay.com/v1";

/** key_id is safe to hand to the browser — the secret never leaves the edge. */
export const RAZORPAY_KEY_ID = KEY_ID;
export const razorpayConfigured = Boolean(KEY_ID && KEY_SECRET);
export const webhookSecretConfigured = Boolean(WEBHOOK_SECRET);

/** rzp_test_* keys hit Razorpay's test mode; rzp_live_* move real money. */
export const isTestMode = KEY_ID.startsWith("rzp_test");

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
  notes: Record<string, string>;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string | null;
  email: string | null;
  contact: string | null;
  error_code?: string | null;
  error_description?: string | null;
  acquirer_data?: Record<string, unknown> | null;
  notes?: Record<string, string>;
}

function authHeader(): string {
  return "Basic " + btoa(`${KEY_ID}:${KEY_SECRET}`);
}

async function rzpFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: any }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    console.error("razorpay: network error on", path, e);
    return { ok: false, status: 502, error: { description: "Could not reach Razorpay" } };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // Razorpay always answers JSON; a non-JSON body means something upstream broke.
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.error ?? body ?? {} };
  }
  return { ok: true, data: body as T };
}

/** Rupees (the `orders.total` numeric) -> integer paise, which is all Razorpay accepts. */
export function toPaise(rupees: number | string): number {
  return Math.round(Number(rupees) * 100);
}

export function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  return rzpFetch<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      // Razorpay caps receipt at 40 chars; order numbers are ~12 so this is slack.
      receipt: input.receipt.slice(0, 40),
      notes: input.notes ?? {},
    }),
  });
}

export function fetchRazorpayPayment(paymentId: string) {
  return rzpFetch<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

/** Only needed when the account is set to manual capture — see razorpay-verify. */
export function captureRazorpayPayment(paymentId: string, amountPaise: number) {
  return rzpFetch<RazorpayPayment>(
    `/payments/${encodeURIComponent(paymentId)}/capture`,
    {
      method: "POST",
      body: JSON.stringify({ amount: amountPaise, currency: "INR" }),
    },
  );
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent, content-constant-time comparison of two hex digests. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* The checkout handler hands the browser razorpay_order_id, razorpay_payment_id
 * and razorpay_signature. The signature is HMAC-SHA256("<order_id>|<payment_id>")
 * keyed with the API secret, so only someone holding the secret could have
 * produced it — that is what makes the browser's claim of "paid" trustworthy. */
export async function verifyPaymentSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<boolean> {
  if (!KEY_SECRET) return false;
  const expected = await hmacSha256Hex(
    `${input.razorpayOrderId}|${input.razorpayPaymentId}`,
    KEY_SECRET,
  );
  return safeEqual(expected, (input.signature || "").toLowerCase());
}

/* Webhooks are signed with a separate secret (the one typed into the Razorpay
 * dashboard when the webhook is created), over the exact raw request body. */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false;
  const expected = await hmacSha256Hex(rawBody, WEBHOOK_SECRET);
  return safeEqual(expected, (signature || "").toLowerCase());
}
