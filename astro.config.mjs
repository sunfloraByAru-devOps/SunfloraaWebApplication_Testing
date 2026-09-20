// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://sunfloracrochet.in',
  // The dashboard is private - keep it out of the public sitemap.
  integrations: [sitemap({ filter: (page) => !page.includes('/admin') })],

  vite: {
    plugins: [tailwindcss()]
  }
});
