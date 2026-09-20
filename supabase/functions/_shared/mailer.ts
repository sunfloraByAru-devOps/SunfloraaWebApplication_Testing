import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") || "Sunflora";

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  if (to.length === 0) return { sent: false, error: "no recipient" };

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error(
      "GMAIL_USER / GMAIL_APP_PASSWORD secrets are not set — skipping email send.",
    );
    return { sent: false, skipped: true };
  }

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });

  try {
    await client.send({
      from: `${FROM_NAME} <${GMAIL_USER}>`,
      to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
      content: opts.text || opts.subject,
    });
    return { sent: true };
  } catch (err) {
    console.error("sendMail failed:", err);
    return { sent: false, error: String(err) };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
}
