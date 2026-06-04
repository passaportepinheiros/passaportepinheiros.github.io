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

export function instagramProfileUrl(instagram?: string | null): string | undefined {
  const handle = instagram
    ?.trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\/+$/, '');

  return handle ? `https://www.instagram.com/${handle}/` : undefined;
}

export function getRelatedExperiences(
  current: Experience,
  experiences: Experience[],
  limit = 4,
): Experience[] {
  return experiences
    .filter((experience) => experience.data.slug !== current.data.slug)
    .filter((experience) => experience.data.category === current.data.category)
    .map((experience) => ({
      experience,
      score: getExperienceSimilarityScore(current, experience),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.experience.data.title.localeCompare(b.experience.data.title, 'pt-BR', {
        sensitivity: 'base',
      });
    })
    .slice(0, limit)
    .map((item) => item.experience);
}

export function getExperienceSimilarityScore(current: Experience, candidate: Experience): number {
  let score = 0;

  if (candidate.data.category === current.data.category) {
    score += 100;
  }

  if (candidate.data.benefitType && candidate.data.benefitType === current.data.benefitType) {
    score += 18;
  }

  if (candidate.data.categoria_fsq && candidate.data.categoria_fsq === current.data.categoria_fsq) {
    score += 24;
  }

  const currentTags = new Set(current.data.tags ?? []);
  const candidateTags = new Set(candidate.data.tags ?? []);
  const sharedTags = [...currentTags].filter((tag) => candidateTags.has(tag));

  if (sharedTags.length > 0) {
    score += 32 + sharedTags.length * 8;
  }

  if (hasSharedStreet(current, candidate)) {
    score += 12;
  }

  const distanceMeters = getClosestDistanceMeters(current, candidate);
  if (typeof distanceMeters === 'number') {
    if (distanceMeters <= 250) score += 18;
    else if (distanceMeters <= 600) score += 12;
    else if (distanceMeters <= 1000) score += 6;
  }

  score += Math.min(getDescriptionTokenOverlap(current, candidate) * 18, 18);

  return score;
}

function hasSharedStreet(a: Experience, b: Experience): boolean {
  const streetsA = new Set(a.data.enderecos.map((endereco) => normalizeComparable(endereco.logradouro)));

  return b.data.enderecos.some((endereco) => streetsA.has(normalizeComparable(endereco.logradouro)));
}

function getClosestDistanceMeters(a: Experience, b: Experience): number | null {
  const distances = a.data.enderecos.flatMap((enderecoA) =>
    b.data.enderecos.map((enderecoB) => getDistanceMeters(enderecoA, enderecoB)),
  ).filter((distance): distance is number => typeof distance === 'number');

  return distances.length > 0 ? Math.min(...distances) : null;
}

function getDistanceMeters(
  a: { lat?: number; lng?: number },
  b: { lat?: number; lng?: number },
): number | null {
  if (
    typeof a.lat !== 'number' ||
    typeof a.lng !== 'number' ||
    typeof b.lat !== 'number' ||
    typeof b.lng !== 'number'
  ) {
    return null;
  }

  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function getDescriptionTokenOverlap(a: Experience, b: Experience): number {
  const tokensA = getComparableTokens(a.data.description ?? '');
  const tokensB = new Set(getComparableTokens(b.data.description ?? ''));

  if (tokensA.length === 0 || tokensB.size === 0) {
    return 0;
  }

  return tokensA.filter((token) => tokensB.has(token)).length / tokensA.length;
}

function getComparableTokens(value: string): string[] {
  return normalizeComparable(value)
    .split(' ')
    .filter((token) => token.length >= 4)
    .filter((token) => !['compra', 'ganhe', 'valido', 'passaporte'].includes(token));
}

function normalizeComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
    instagramProfileUrl(experience.data.instagram) ?? '',
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

export const knownTags: Array<{ value: string; label: string; aliases?: string[] }> = [
  { value: 'cafe', label: 'Café' },
  { value: 'bar', label: 'Bar' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'chopp', label: 'Chopp/Cerveja', aliases: ['cerveja'] },
  { value: 'vinho', label: 'Vinho' },
  { value: 'pizza', label: 'Pizza' },
  { value: 'hamburguer', label: 'Hambúrguer' },
  { value: 'japonesa', label: 'Japonesa' },
  { value: 'italiana', label: 'Italiana' },
  { value: 'massas', label: 'Massas' },
  { value: 'mexicana', label: 'Mexicana' },
  { value: 'arabe', label: 'Árabe' },
  { value: 'brasileira', label: 'Brasileira' },
  { value: 'confort-food', label: 'Comfort food' },
  { value: 'francesa', label: 'Francesa' },
  { value: 'churrasco', label: 'Churrasco' },
  { value: 'gelato', label: 'Gelato' },
  { value: 'sorvete', label: 'Sorvete' },
  { value: 'doces', label: 'Doces' },
  { value: 'padaria', label: 'Padaria' },
  { value: 'petiscos', label: 'Petiscos' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'saudavel', label: 'Saudável' },
  { value: 'loja', label: 'Loja' },
  { value: 'danca', label: 'Dança' },
  { value: 'pet', label: 'Pet' },
  { value: 'tattoo', label: 'Tatuagem' },
  { value: 'idiomas', label: 'Idiomas' },
  { value: 'viagem', label: 'Viagem' },
  { value: 'bem-estar', label: 'Bem-estar' },
];
