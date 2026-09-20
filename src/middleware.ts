import { defineMiddleware } from 'astro:middleware'

/* The site is built with `output: static` and served from Cloudflare as plain
 * files, so this middleware runs at BUILD time only - there is no server at
 * runtime to check a session against. A redirect here would therefore protect
 * nothing: anyone can fetch /admin/index.html directly.
 *
 * So the dashboard is secured where it actually can be:
 *   1. Row Level Security - every write requires profiles.role = 'admin', and
 *      the order/customer tables require it to read too. This is the real
 *      boundary; see supabase/sql/.
 *   2. The page itself checks the session and role before drawing anything,
 *      and signs out non-admins (src/lib/admin/app.ts).
 *   3. /admin is noindex and excluded from robots.txt and the sitemap.
 *
 * If this project ever gains an SSR adapter, this is the place to add the
 * session + role check so /admin stops being served to signed-out visitors.
 */
export const onRequest = defineMiddleware(async (_ctx, next) => next())
