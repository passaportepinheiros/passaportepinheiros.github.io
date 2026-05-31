import type { CollectionEntry } from 'astro:content';
import { withBase } from './urls';

export type Experience = CollectionEntry<'experiencias'>;
export type Category = 'produtos' | 'restaurantes' | 'servicos';

export const categories: Array<{ value: Category; label: string; plural: string }> = [
  { value: 'restaurantes', label: 'Restaurante', plural: 'Restaurantes' },
  { value: 'servicos', label: 'Serviço', plural: 'Serviços' },
  { value: 'produtos', label: 'Produto', plural: 'Produtos' },
];

export function categoryLabel(category: Category): string {
  return categories.find((item) => item.value === category)?.plural ?? category;
}

export function categorySingular(category: Category): string {
  return categories.find((item) => item.value === category)?.label ?? category;
}

export function sortExperiences(experiences: Experience[]): Experience[] {
  return [...experiences].sort((a, b) =>
    a.data.title.localeCompare(b.data.title, 'pt-BR', { sensitivity: 'base' }),
  );
}

export function getCategoryCounts(experiences: Experience[]): Record<Category | 'todos', number> {
  const counts: Record<Category | 'todos', number> = {
    todos: experiences.length,
    produtos: 0,
    restaurantes: 0,
    servicos: 0,
  };

  for (const experience of experiences) {
    counts[experience.data.category] += 1;
  }

  return counts;
}

export function compactDescription(description: string, maxLength = 132): string {
  const compact = normalizeDescription(description);

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trim()}...`;
}

export function normalizeDescription(description: string): string {
  return description.replace(/\s+/g, ' ').trim();
}

export function descriptionParagraphs(description: string): string[] {
  return description
    .trim()
    .split(/\n\s*\n+/)
    .map((paragraph) => normalizeDescription(paragraph))
    .filter(Boolean);
}

export function searchPayload(experience: Experience): string {
  const enderecos = experience.data.enderecos
    .flatMap((endereco) => [
      endereco.logradouro,
      endereco.numero,
      endereco.complemento ?? '',
      ...endereco.telefones.flatMap((telefone) => [telefone.numero, telefone.formatado]),
    ])
    .join(' ');

  return [
    experience.data.title,
    experience.data.slug,
    experience.data.category,
    experience.data.instagram ?? '',
    experience.data.instagramUrl ?? '',
    experience.data.description ?? '',
    enderecos,
  ]
    .join(' ')
    .toLocaleLowerCase('pt-BR');
}

export function experiencePath(experience: Experience): string {
  return withBase(`/${experience.data.slug}/`);
}

export function buildExperiencesUrl(category?: Category | 'todos', busca?: string): string {
  const params = new URLSearchParams();
  if (category && category !== 'todos') params.set('categoria', category);
  if (busca && busca.trim()) params.set('busca', busca.trim());
  const qs = params.toString();
  return withBase(`/experiencias/${qs ? `?${qs}` : ''}`);
}

export type BenefitType =
  | 'compre-1-leve-outro'
  | 'desconto'
  | 'brinde'
  | 'isencao-taxa'
  | 'beneficio-especial';

export const benefitTypes: Array<{ value: BenefitType; label: string; emoji: string }> = [
  { value: 'compre-1-leve-outro', label: 'Compre 1 Leve 2', emoji: '🎁' },
  { value: 'desconto', label: 'Desconto', emoji: '🏷️' },
  { value: 'brinde', label: 'Brinde', emoji: '✨' },
  { value: 'isencao-taxa', label: 'Isenção de Taxa', emoji: '🆓' },
  { value: 'beneficio-especial', label: 'Benefício Especial', emoji: '⭐' },
];

export function benefitTypeLabel(value: BenefitType): string {
  return benefitTypes.find((b) => b.value === value)?.label ?? value;
}

export const knownTags: Array<{ value: string; label: string }> = [
  { value: 'cafe', label: 'Café' },
  { value: 'bar', label: 'Bar' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'chopp', label: 'Chopp/Cerveja' },
  { value: 'vinho', label: 'Vinho' },
  { value: 'pizza', label: 'Pizza' },
  { value: 'hamburguer', label: 'Hambúrguer' },
  { value: 'japonesa', label: 'Japonesa' },
  { value: 'italiana', label: 'Italiana' },
  { value: 'mexicana', label: 'Mexicana' },
  { value: 'arabe', label: 'Árabe' },
  { value: 'brasileira', label: 'Brasileira' },
  { value: 'churrasco', label: 'Churrasco' },
  { value: 'gelato', label: 'Gelato' },
  { value: 'sorvete', label: 'Sorvete' },
  { value: 'doces', label: 'Doces' },
  { value: 'padaria', label: 'Padaria' },
  { value: 'petiscos', label: 'Petiscos' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'saudavel', label: 'Saudável' },
  { value: 'danca', label: 'Dança' },
  { value: 'pet', label: 'Pet' },
  { value: 'tattoo', label: 'Tatuagem' },
  { value: 'idiomas', label: 'Idiomas' },
];
