/* Promote a Sunflora account to shop admin, and optionally set its password.
 *
 *   node scripts/make-admin.mjs <email> [newPassword]
 *
 * Uses the service-role key from .env. `role = 'admin'` is what every RLS
 * policy checks via public.is_admin(), so this is the switch that turns the
 * dashboard on for a person. */

import fs from "node:fs";

const [, , email, newPassword] = process.argv;
if (!email) {
  console.error("usage: node scripts/make-admin.mjs <email> [newPassword]");
  process.exit(2);
}

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter(Boolean)
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL_ = env.PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PAT = env.PERSONAL_ACCESS_TOKEN;
const REF = URL_.replace(/^https:\/\//, "").split(".")[0];

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL failed: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

const safe = email.replace(/'/g, "''");
const found = await sql(`select id from auth.users where email = '${safe}'`);
if (!found.length) {
  console.error(`No account exists for ${email}. They must sign up first.`);
  process.exit(1);
}
const id = found[0].id;

if (newPassword) {
  const r = await fetch(`${URL_}/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword, email_confirm: true }),
  });
  if (!r.ok) { console.error("Could not set the password:", (await r.text()).slice(0, 300)); process.exit(1); }
  console.log("password set");
}

await sql(`update public.profiles set role = 'admin' where id = '${id}'`);

const check = await sql(
  `select u.email, p.role, p.full_name, u.encrypted_password is not null as has_password
     from auth.users u join public.profiles p on p.id = u.id where u.id = '${id}'`);
console.log("account now:", JSON.stringify(check[0]));

const tally = await sql("select role, count(*) c from public.profiles group by role order by role");
console.log("roles across all profiles:", tally.map((r) => `${r.role}=${r.c}`).join(", "));
