import { getCollection } from 'astro:content';

function getSingleEntry<T>(entries: T[], label: string): T {
  if (entries.length !== 1) {
    throw new Error(`Conteúdo de ${label} não encontrado ou duplicado.`);
  }

  return entries[0];
}

export async function getSiteSettings() {
  const entries = await getCollection('siteSettings');
  return getSingleEntry(entries, 'configurações gerais').data;
}

export async function getHomePage() {
  const entries = await getCollection('homePage');
  return getSingleEntry(entries, 'home').data;
}

export async function getHowItWorksPage() {
  const entries = await getCollection('howItWorksPage');
  return getSingleEntry(entries, 'Como funciona').data;
}
