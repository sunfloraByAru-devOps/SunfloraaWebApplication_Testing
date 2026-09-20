export const SITE_URL = Deno.env.get("SITE_URL") || "https://sunfloracrochet.in";
export const BRAND = Deno.env.get("MAIL_FROM_NAME") || "Sunflora";
export const BRAND_GOLD = "#C8862C";
export const BRAND_ROSE = "#D4708F";
export const BRAND_CREAM = "#FFF8F0";
export const BRAND_DARK = "#5C3D2E";

export const ORDER_STAGES: Record<
  string,
  { label: string; description: string; step: number }
> = {
  pending: {
    label: "Order Received",
    description:
      "We've received your order and it's awaiting payment confirmation.",
    step: 1,
  },
  confirmed: {
    label: "Confirmed",
    description:
      "Payment received! Your order is confirmed and queued for crafting.",
    step: 2,
  },
  crafting: {
    label: "Crafting",
    description: "Our artisans are handcrafting your order with care.",
    step: 3,
  },
  ready_to_ship: {
    label: "Ready to Ship",
    description: "Your order is packed and waiting for pickup by our courier.",
    step: 4,
  },
  shipped: {
    label: "Shipped",
    description: "Your order has left our studio and is on its way to you.",
    step: 5,
  },
  out_for_delivery: {
    label: "Out for Delivery",
    description: "Your order is out for delivery and should arrive today.",
    step: 6,
  },
  delivered: {
    label: "Delivered",
    description: "Your order has been delivered. We hope you love it!",
    step: 7,
  },
  cancelled: {
    label: "Cancelled",
    description: "This order has been cancelled.",
    step: 0,
  },
};

export const CUSTOM_ORDER_STAGES: Record<
  string,
  { label: string; description: string; step: number }
> = {
  received: {
    label: "Request Received",
    description: "We've received your custom order request and will review it shortly.",
    step: 1,
  },
  reviewing: {
    label: "Reviewing",
    description: "Our team is reviewing your custom request and inspiration.",
    step: 2,
  },
  quoted: {
    label: "Quote Ready",
    description: "We've prepared a quote for your custom piece — check your email for the price.",
    step: 3,
  },
  accepted: {
    label: "Accepted",
    description: "You've accepted the quote — we're getting ready to start crafting.",
    step: 4,
  },
  crafting: {
    label: "Crafting",
    description: "Our artisans are handcrafting your custom piece.",
    step: 5,
  },
  shipped: {
    label: "Shipped",
    description: "Your custom order has left our studio and is on its way.",
    step: 6,
  },
  delivered: {
    label: "Delivered",
    description: "Your custom order has been delivered. Enjoy!",
    step: 7,
  },
  cancelled: {
    label: "Cancelled",
    description: "This custom order request has been cancelled.",
    step: 0,
  },
};

// Mirrors the topic cards on /contact — each drives the customer auto-reply
// subject/copy and whether the admin notification is flagged urgent.
export const CONTACT_TOPICS: Record<
  string,
  { subject: string; heading: string; body: string; urgent?: boolean }
> = {
  custom: {
    subject: "We've got your custom order inquiry! 🌻",
    heading: "Your custom idea is in good hands",
    body:
      "Thank you for telling us about the piece you're dreaming up. Our team reads every custom inquiry personally, and we'll follow up within 1-2 business days to talk through details, sizing, and timeline." +
      "<br/><br/>If you'd like to start the full custom order builder (with reference photos and sizing) in the meantime, you can do that any time from our Custom Orders page.",
  },
  partner: {
    subject: "Thanks for reaching out to partner with us 🤝",
    heading: "Let's build something together",
    body:
      "We love working with brands, boutiques, and creators who care about handmade quality. Thank you for thinking of Sunflora — someone from our team will review your note and get back to you within 1-2 business days.",
  },
  journey: {
    subject: "Thanks for wanting to join our journey 🌱",
    heading: "We'd love to have you along",
    body:
      "Thank you for your interest in creating or working with us. We read every message and will reach out personally within 1-2 business days if there's a fit for where we are right now.",
  },
  support: {
    subject: "We've received your order support request",
    heading: "We're on it",
    body:
      "Thanks for the details about your order. Our support team will look into it and reply within 1-2 business days. If it's urgent, you can also track your order any time from the Track Order page.",
  },
  feedback: {
    subject: "Thank you for your feedback 💛",
    heading: "We're listening",
    body:
      "Your thoughts genuinely help us get better. Thank you for taking the time to share — we read every piece of feedback, even if we can't always reply individually.",
  },
  wrong: {
    subject: "We're sorry — we've received your message",
    heading: "We're on it, right away",
    body:
      "We're sorry to hear something didn't go as it should have. Your message has been flagged to our team as a priority and we'll be in touch as soon as possible to make it right.",
    urgent: true,
  },
};

export function wrapEmail(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:${BRAND_CREAM};font-family:Georgia,'Times New Roman',serif;color:${BRAND_DARK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_CREAM};padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E8D5C4;">
            <tr>
              <td align="center" style="padding:28px 32px 16px 32px;">
                <span style="font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:4px;text-transform:uppercase;color:${BRAND_GOLD};font-weight:bold;">${BRAND}</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 8px 32px;">
                <span style="font-size:13px;color:${BRAND_ROSE};letter-spacing:5px;">&#10047; &#10047; &#10047;</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 8px 40px;">
                <h1 style="font-size:22px;margin:0 0 16px;color:${BRAND_DARK};text-align:center;">${title}</h1>
                <div style="font-size:15px;line-height:24px;color:#6B5B4E;">${bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#FDF2E9;font-size:12px;color:#9C8B7E;text-align:center;">
                ${BRAND} &middot; Handmade with love &middot; <a href="${SITE_URL}" style="color:${BRAND_GOLD};text-decoration:none;">${SITE_URL.replace(/^https?:\/\//, "")}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function money(n: number | string): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `₹${(v || 0).toFixed(2)}`;
}
