import type { Category, Experience } from '../experiences';

/**
 * Factory para criar experiências mock com apenas os campos necessários para os testes.
 * Os campos não fornecidos recebem valores padrão.
 */
export function makeExperience(overrides: {
  title?: string;
  slug?: string;
  category?: Category;
  instagram?: string;
  instagramUrl?: string;
  description?: string;
  enderecos?: Array<{
    logradouro?: string;
    numero?: string;
    complemento?: string;
    telefones?: Array<{ tipo: 'telefone' | 'whatsapp'; numero: string; formatado: string }>;
    lat?: number;
    lng?: number;
  }>;
  images?: { experience: string; logo: string };
  source?: { path: string; filename: string };
} = {}): Experience {
  return {
    id: overrides.slug ?? 'test-experience',
    collection: 'experiencias',
    data: {
      title: overrides.title ?? 'Experiência Teste',
      slug: overrides.slug ?? 'experiencia-teste',
      category: overrides.category ?? 'restaurantes',
      instagram: overrides.instagram ?? 'instagramtest',
      instagramUrl: overrides.instagramUrl ?? 'https://www.instagram.com/instagramtest/',
      description: overrides.description ?? 'Descrição de teste.',
      enderecos: (overrides.enderecos ?? []).map((e) => ({
        logradouro: e.logradouro ?? 'Rua Teste',
        numero: e.numero ?? '123',
        complemento: e.complemento,
        telefones: e.telefones ?? [],
        lat: e.lat,
        lng: e.lng,
      })),
      images: overrides.images ?? {
        experience: '/img/test.jpg',
        logo: '/img/logo-test.png',
      },
      source: overrides.source ?? {
        path: 'test/experiencia-teste.md',
        filename: 'experiencia-teste.md',
      },
    },
  } as unknown as Experience;
}
