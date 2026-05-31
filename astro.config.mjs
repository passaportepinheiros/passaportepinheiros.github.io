// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://teles.dev.br',
  base: '/passaportepinheiros',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
