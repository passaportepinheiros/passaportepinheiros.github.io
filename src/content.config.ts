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
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  cep: z.string().optional(),
  telefones: z.array(telefoneSchema).default([]),
  lat: z.number().optional(),
  lng: z.number().optional(),
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
    instagram: z.string().optional(),
    enderecos: z.array(enderecoSchema).default([]),
    googlePlaceId: z.string().optional(),
    foursquare_id: z.string().optional(),
    categoria_fsq: z.string().optional(),
    website: z.string().optional(),
    description: z.string().optional(),
    images: z.object({
      experience: z.string(),
      logo: z.string(),
    }).optional(),
    tags: z.array(z.string()).default([]),
    benefitType: z.enum([
      'compre-1-leve-outro',
      'desconto',
      'brinde',
      'isencao-taxa',
      'beneficio-especial',
    ]).default('beneficio-especial'),
  }),
});

const faq = defineCollection({
  loader: glob({
    base: './src/content/faq',
    pattern: '**/*.md',
  }),
  schema: z.object({
    question: z.string(),
    order: z.number(),
  }),
});

const pageImageSchema = z.object({
  src: z.string(),
  alt: z.string(),
});

const pageActionSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const seoSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const siteSettings = defineCollection({
  loader: glob({
    base: './src/content/site',
    pattern: 'settings.yml',
  }),
  schema: z.object({
    brandName: z.string(),
    purchaseCta: pageActionSchema,
    footer: z.object({
      tagline: z.string(),
      links: z.array(pageActionSchema),
      socialLinks: z.array(z.object({
        label: z.string(),
        icon: z.enum(['facebook', 'instagram']),
        href: z.string(),
        ariaLabel: z.string(),
      })),
    }),
  }),
});

const homePage = defineCollection({
  loader: glob({
    base: './src/content/site',
    pattern: 'home.yml',
  }),
  schema: z.object({
    seo: seoSchema,
    hero: z.object({
      eyebrow: z.string(),
      headline: z.object({
        prefix: z.string(),
        highlight: z.string(),
        suffix: z.string(),
      }),
      intro: z.string(),
    }),
    video: z.object({
      embedUrl: z.string(),
      title: z.string(),
    }),
  }),
});

const howItWorksPage = defineCollection({
  loader: glob({
    base: './src/content/site',
    pattern: 'como-funciona.yml',
  }),
  schema: z.object({
    seo: seoSchema,
    hero: z.object({
      eyebrow: z.string(),
      title: z.string(),
    }),
    steps: z.array(z.object({
      icon: z.enum(['search', 'sparkles', 'atSign', 'circleCheck']),
      title: z.string(),
      text: z.string(),
    })),
    faq: z.object({
      headingHighlight: z.string(),
      headingRest: z.string(),
      intro: z.string(),
    }),
  }),
});

const pages = defineCollection({
  loader: glob({
    base: './src/content/pages',
    pattern: '**/*.md',
  }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    eyebrow: z.string(),
    headline: z.object({
      prefix: z.string(),
      highlight: z.string(),
      suffix: z.string(),
    }),
    intro: z.string(),
    actions: z.object({
      primary: pageActionSchema,
      secondary: pageActionSchema,
    }),
    featuredImages: z.tuple([pageImageSchema, pageImageSchema, pageImageSchema]),
    statsLabel: z.string(),
    pillars: z.array(z.object({
      title: z.string(),
      text: z.string(),
      icon: z.enum(['compass', 'mapPinned', 'sparkles']),
    })),
    editorial: z.object({
      eyebrow: z.string(),
      title: z.string(),
      text: z.string(),
    }),
    guide: z.object({
      icon: z.enum(['bookOpen']),
      title: z.string(),
      paragraphs: z.array(z.string()),
      cta: pageActionSchema,
    }),
  }),
});

export const collections = { experiencias, faq, pages, siteSettings, homePage, howItWorksPage };
