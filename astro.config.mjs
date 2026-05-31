// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://teles.dev.br',
  base: '/passaportepinheiros',
  vite: {
    plugins: [tailwindcss()],
  },
});
