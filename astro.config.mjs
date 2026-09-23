// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

/* The landing page's pictures live in Supabase Storage so Aru can change them
   from the dashboard. Astro will only optimize a remote image when its host is
   authorized here; left out, every one of them ships as an unoptimized
   cross-origin fetch and the page loses the LCP and CLS it has today.

   import.meta.env is not populated inside this file, so read the value the way
   Vite does. */
const { PUBLIC_SUPABASE_URL } = loadEnv(
  process.env.NODE_ENV ?? 'production',
  process.cwd(),
  '',
);

if (!PUBLIC_SUPABASE_URL) {
  throw new Error(
    'PUBLIC_SUPABASE_URL is not set, so remote images cannot be authorized for ' +
    'optimization. The build would fail later with "Cannot optimize remote image", ' +
    'which reads like an image problem rather than a missing environment variable. ' +
    'Set it in .env locally, or in the Workers Builds environment for a deploy.',
  );
}

// https://astro.build/config
export default defineConfig({
  site: 'https://sunfloracrochet.in',
  /* Only pages a stranger could usefully land on from search belong in the
     sitemap. The rest are private (the dashboard, order history), mid-purchase
     (cart, checkout, confirmation), credential screens, or the not-found
     fallback — several of which robots.txt also disallows, so listing them
     here was telling Google two opposite things at once.

     /landing is a second homepage with no internal links pointing at it; it
     competes with / for the same intent, so it stays out until it is either
     removed or given a distinct purpose. */
  integrations: [
    sitemap({
      filter: (page) =>
        ![
          '/admin',
          '/account/orders',
          '/cart',
          '/checkout',
          '/order-confirmation',
          '/login',
          '/signup',
          '/landing',
          '/productdetail/product-not-found',
        ].some((path) => page.includes(path)),
    }),
  ],

  image: {
    /* Scoped to the public object endpoint on purpose. A bare host rule would
       let any future bug turn the build into a fetcher for signed URLs. */
    remotePatterns: [
      {
        protocol: 'https',
        hostname: new URL(PUBLIC_SUPABASE_URL).hostname,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  vite: {
    plugins: [tailwindcss()]
  }
});
