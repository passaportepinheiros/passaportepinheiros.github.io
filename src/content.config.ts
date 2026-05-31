import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const telefoneSchema = z.object({
  tipo: z.enum(['telefone', 'whatsapp']),
  numero: z.string(),
  formatado: z.string(),
});

const enderecoSchema = z.object({
  logradouro: z.string(),
  numero: z.string(),
  complemento: z.string().optional(),
  telefones: z.array(telefoneSchema).default([]),
});

const experiencias = defineCollection({
  loader: glob({
    base: './src/content/experiencias',
    pattern: '**/*.md',
  }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    category: z.enum(['produtos', 'restaurantes', 'servicos']),
    instagram: z.string(),
    instagramUrl: z.url(),
    enderecos: z.array(enderecoSchema).default([]),
    description: z.string(),
    images: z.object({
      experience: z.string(),
      logo: z.string(),
    }),
    source: z.object({
      path: z.string(),
      filename: z.string(),
    }),
  }),
});

export const collections = { experiencias };
