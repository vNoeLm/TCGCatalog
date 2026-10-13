// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },

  // The page's own styles go into the HTML instead of a separate file the browser has to fetch
  // before it can draw anything (Lighthouse: render-blocking request).
  build: {
    inlineStylesheets: 'always',
  },

  integrations: [react()],
  adapter: vercel()
});