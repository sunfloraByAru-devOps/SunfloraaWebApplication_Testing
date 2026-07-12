import { createClient } from "@supabase/supabase-js";

// IMPORTANT: this module is imported from client-side <script> tags
// (LandingNav, LoginGate, login/signup, cart, checkout, account/orders,
// track-order, order-confirmation). Astro/Vite only inlines env vars into
// the browser bundle when they're prefixed with PUBLIC_ — anything else
// (e.g. plain SUPABASE_URL) comes back as `undefined` in the browser even
// though it works fine server-side. When that happened, createClient(undefined,
// undefined) threw immediately at import time, and because a thrown static
// import fails the *entire* importing script, every unrelated bit of code in
// that same <script> block (the hamburger menu toggle, the cart badge
// listener, form submit handlers, the checkout order summary, etc.) never ran
// either. Set these in your .env locally and in your host's environment
// variables (same values as SUPABASE_URL / SUPABASE_KEY):
//   PUBLIC_SUPABASE_URL=...
//   PUBLIC_SUPABASE_KEY=...
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[Sunflora] Missing PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_KEY. " +
      "Auth, cart sync with your account, and orders will not work until " +
      "these are set. Using a disabled placeholder client so the rest of " +
      "the page (menu, cart, etc.) can still render instead of crashing.",
  );
}

// Placeholder values are syntactically valid so createClient never throws —
// any real supabase call will just fail (and get caught) instead of taking
// down the whole page's script.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-anon-key",
);