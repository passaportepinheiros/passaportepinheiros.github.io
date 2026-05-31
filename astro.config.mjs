// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://passaportepinheiros.com.br',
  vite: {
    plugins: [tailwindcss()],
  },
});
