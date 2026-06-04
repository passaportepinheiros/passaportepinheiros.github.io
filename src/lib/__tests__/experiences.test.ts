import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  categorySingular,
  sortExperiences,
  getRelatedExperiences,
  getCategoryCounts,
  compactDescription,
  normalizeDescription,
  descriptionParagraphs,
  searchPayload,
  experiencePath,
  categories,
  knownTags,
} from '../experiences';
import { makeExperience } from './helpers';

describe('categories', () => {
  it('deve ter 3 categorias definidas', () => {
    expect(categories).toHaveLength(3);
  });

  it('deve conter restaurantes, servicos e produtos', () => {
    const values = categories.map((c) => c.value);
    expect(values).toContain('restaurantes');
    expect(values).toContain('servicos');
    expect(values).toContain('produtos');
  });

  it('cada categoria deve ter value, label e plural', () => {
    for (const cat of categories) {
      expect(cat).toHaveProperty('value');
      expect(cat).toHaveProperty('label');
      expect(cat).toHaveProperty('plural');
    }
  });
});

describe('knownTags', () => {
  it('não possui tags visíveis duplicadas', () => {
    const values = knownTags.map((tag) => tag.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('cobre todas as experiências com pelo menos uma tag visível', () => {
    const contentDir = join(process.cwd(), 'src/content/experiencias');
    const tagValues = knownTags.flatMap((tag) => [tag.value, ...(tag.aliases ?? [])]);
    const files = listMarkdownFiles(contentDir);
    const withoutVisibleTag = files
      .map((file) => ({
        file,
        tags: readExperienceTags(readFileSync(file, 'utf8')),
      }))
      .filter((entry) => !entry.tags.some((tag) => tagValues.includes(tag)))
      .map((entry) => entry.file.replace(`${process.cwd()}/`, ''));

    expect(withoutVisibleTag).toEqual([]);
  });
});

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
  });
}

function readExperienceTags(markdown: string): string[] {
  const inline = markdown.match(/^tags:\s*\[(.*?)\]/m);
  if (inline) {
    return inline[1]
      .split(',')
      .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  const block = markdown.match(/^tags:\s*\n((?:\s+-\s+.*\n?)+)/m);
  if (!block) return [];

  return block[1]
    .split('\n')
    .map((tag) => tag.trim().replace(/^-\s*/, '').replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

describe('categoryLabel', () => {
  it('retorna plural de restaurantes', () => {
    expect(categoryLabel('restaurantes')).toBe('Restaurantes');
  });

  it('retorna plural de servicos', () => {
    expect(categoryLabel('servicos')).toBe('Serviços');
  });

  it('retorna plural de produtos', () => {
    expect(categoryLabel('produtos')).toBe('Produtos');
  });

  it('retorna o valor original quando categoria não encontrada', () => {
    // @ts-expect-error - testando categoria inválida
    expect(categoryLabel('invalida')).toBe('invalida');
  });
});

describe('categorySingular', () => {
  it('retorna singular de restaurantes', () => {
    expect(categorySingular('restaurantes')).toBe('Restaurante');
  });

  it('retorna singular de servicos', () => {
    expect(categorySingular('servicos')).toBe('Serviço');
  });

  it('retorna singular de produtos', () => {
    expect(categorySingular('produtos')).toBe('Produto');
  });

  it('retorna o valor original quando categoria não encontrada', () => {
    // @ts-expect-error - testando categoria inválida
    expect(categorySingular('invalida')).toBe('invalida');
  });
});

describe('sortExperiences', () => {
  it('retorna array vazio para entrada vazia', () => {
    expect(sortExperiences([])).toEqual([]);
  });

  it('retorna o mesmo item para array com um elemento', () => {
    const exp = makeExperience({ title: 'Único' });
    expect(sortExperiences([exp])).toEqual([exp]);
  });

  it('ordena experiências em ordem alfabética', () => {
    const exp1 = makeExperience({ title: 'Zebra Bar', slug: 'zebra-bar' });
    const exp2 = makeExperience({ title: 'Alfa Café', slug: 'alfa-cafe' });
    const exp3 = makeExperience({ title: 'Manga Bistro', slug: 'manga-bistro' });

    const sorted = sortExperiences([exp1, exp2, exp3]);

    expect(sorted[0].data.title).toBe('Alfa Café');
    expect(sorted[1].data.title).toBe('Manga Bistro');
    expect(sorted[2].data.title).toBe('Zebra Bar');
  });

  it('ordena ignorando acentuação (locale pt-BR)', () => {
    const exp1 = makeExperience({ title: 'Ótimo', slug: 'otimo' });
    const exp2 = makeExperience({ title: 'Açaí', slug: 'acai' });
    const exp3 = makeExperience({ title: 'Bom', slug: 'bom' });

    const sorted = sortExperiences([exp1, exp2, exp3]);

    expect(sorted[0].data.title).toBe('Açaí');
    expect(sorted[1].data.title).toBe('Bom');
    expect(sorted[2].data.title).toBe('Ótimo');
  });

  it('não modifica o array original', () => {
    const exp1 = makeExperience({ title: 'Zebra', slug: 'zebra' });
    const exp2 = makeExperience({ title: 'Alfa', slug: 'alfa' });
    const original = [exp1, exp2];

    sortExperiences(original);

    expect(original[0].data.title).toBe('Zebra');
    expect(original[1].data.title).toBe('Alfa');
  });
});

describe('getRelatedExperiences', () => {
  it('prioriza experiências mais parecidas em vez da ordem alfabética', () => {
    const current = makeExperience({
      title: 'Atual',
      slug: 'atual',
      category: 'restaurantes',
      benefitType: 'desconto',
      categoria_fsq: 'Italian Restaurant',
      tags: ['pizza', 'vinho'],
      description: 'Pizza e vinho para compartilhar.',
    });
    const alphabeticalFirst = makeExperience({
      title: 'A Bar',
      slug: 'a-bar',
      category: 'restaurantes',
      benefitType: 'brinde',
      categoria_fsq: 'Bar',
      tags: ['drinks'],
      description: 'Drinks e petiscos.',
    });
    const similar = makeExperience({
      title: 'Z Similar',
      slug: 'z-similar',
      category: 'restaurantes',
      benefitType: 'desconto',
      categoria_fsq: 'Italian Restaurant',
      tags: ['pizza', 'vinho'],
      description: 'Pizza artesanal com vinho.',
    });

    const related = getRelatedExperiences(current, [alphabeticalFirst, similar, current], 1);

    expect(related.map((item) => item.data.slug)).toEqual(['z-similar']);
  });

  it('limita a quantidade, exclui a experiência atual e fica na mesma categoria', () => {
    const current = makeExperience({ slug: 'atual', category: 'restaurantes' });
    const restaurants = Array.from({ length: 5 }, (_, index) =>
      makeExperience({
        title: `Restaurante ${index}`,
        slug: `restaurante-${index}`,
        category: 'restaurantes',
      }),
    );
    const service = makeExperience({ slug: 'servico', category: 'servicos' });

    const related = getRelatedExperiences(current, [current, service, ...restaurants], 4);

    expect(related).toHaveLength(4);
    expect(related.some((item) => item.data.slug === 'atual')).toBe(false);
    expect(related.every((item) => item.data.category === 'restaurantes')).toBe(true);
  });
});

describe('getCategoryCounts', () => {
  it('retorna todos zerados para array vazio', () => {
    const counts = getCategoryCounts([]);
    expect(counts).toEqual({ todos: 0, produtos: 0, restaurantes: 0, servicos: 0 });
  });

  it('conta corretamente por categoria', () => {
    const experiences = [
      makeExperience({ category: 'restaurantes', slug: 'r1' }),
      makeExperience({ category: 'restaurantes', slug: 'r2' }),
      makeExperience({ category: 'servicos', slug: 's1' }),
      makeExperience({ category: 'produtos', slug: 'p1' }),
    ];

    const counts = getCategoryCounts(experiences);

    expect(counts.todos).toBe(4);
    expect(counts.restaurantes).toBe(2);
    expect(counts.servicos).toBe(1);
    expect(counts.produtos).toBe(1);
  });

  it('conta corretamente quando todas são da mesma categoria', () => {
    const experiences = [
      makeExperience({ category: 'produtos', slug: 'p1' }),
      makeExperience({ category: 'produtos', slug: 'p2' }),
      makeExperience({ category: 'produtos', slug: 'p3' }),
    ];

    const counts = getCategoryCounts(experiences);

    expect(counts.todos).toBe(3);
    expect(counts.produtos).toBe(3);
    expect(counts.restaurantes).toBe(0);
    expect(counts.servicos).toBe(0);
  });

  it('inclui todos como total geral', () => {
    const experiences = [
      makeExperience({ category: 'restaurantes', slug: 'r1' }),
      makeExperience({ category: 'servicos', slug: 's1' }),
    ];

    expect(getCategoryCounts(experiences).todos).toBe(2);
  });
});

describe('normalizeDescription', () => {
  it('mantém texto simples sem alterações', () => {
    expect(normalizeDescription('Texto simples')).toBe('Texto simples');
  });

  it('remove espaços múltiplos entre palavras', () => {
    expect(normalizeDescription('Texto  com   espaços')).toBe('Texto com espaços');
  });

  it('remove espaços e tabs no início e fim', () => {
    expect(normalizeDescription('  texto com espaços  ')).toBe('texto com espaços');
    expect(normalizeDescription('\ttexto\t')).toBe('texto');
  });

  it('normaliza quebras de linha para espaço único', () => {
    expect(normalizeDescription('linha1\nlinha2')).toBe('linha1 linha2');
  });

  it('normaliza combinação de espaços e quebras de linha', () => {
    expect(normalizeDescription('texto\n  com\n\tmistura')).toBe('texto com mistura');
  });

  it('retorna string vazia para entrada vazia', () => {
    expect(normalizeDescription('')).toBe('');
  });
});

describe('compactDescription', () => {
  it('retorna descrição curta sem truncar', () => {
    const desc = 'Descrição curta.';
    expect(compactDescription(desc)).toBe('Descrição curta.');
  });

  it('retorna descrição com exatamente maxLength sem truncar', () => {
    const desc = 'a'.repeat(132);
    expect(compactDescription(desc)).toBe(desc);
    expect(compactDescription(desc)).toHaveLength(132);
  });

  it('trunca descrição acima de 132 caracteres (padrão) com reticências', () => {
    const desc = 'a'.repeat(200);
    const result = compactDescription(desc);
    // slice(0, maxLength - 1) + '...' => 131 + 3 = 134 chars
    expect(result.length).toBeLessThan(desc.length);
    expect(result.endsWith('...')).toBe(true);
    expect(result.startsWith('a'.repeat(131))).toBe(true);
  });

  it('usa maxLength customizado', () => {
    const desc = 'Descrição longa que será truncada aqui.';
    const result = compactDescription(desc, 20);
    // slice(0, 19) + '...' => 19 chars + 3 = 22 chars total
    expect(result.length).toBeLessThan(desc.length);
    expect(result.endsWith('...')).toBe(true);
    expect(result).toContain('Descrição longa que');
  });

  it('normaliza espaços antes de compactar', () => {
    const desc = 'Texto   com   espaços   extras   e   mais   palavras   aqui.';
    const result = compactDescription(desc);
    expect(result).not.toMatch(/\s{2,}/);
  });

  it('não trunca se normalização deixar texto abaixo do limite', () => {
    const desc = 'Texto    com    muitos    espaços    que    após    normalização    fica    curto.';
    const result = compactDescription(desc);
    expect(result).toBe(normalizeDescription(desc));
  });
});

describe('descriptionParagraphs', () => {
  it('retorna array com um parágrafo para texto simples', () => {
    const result = descriptionParagraphs('Parágrafo único.');
    expect(result).toEqual(['Parágrafo único.']);
  });

  it('separa parágrafos por linha em branco dupla', () => {
    const desc = 'Parágrafo um.\n\nParágrafo dois.';
    const result = descriptionParagraphs(desc);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Parágrafo um.');
    expect(result[1]).toBe('Parágrafo dois.');
  });

  it('separa por múltiplas linhas em branco', () => {
    const desc = 'Primeiro.\n\n\n\nSegundo.';
    const result = descriptionParagraphs(desc);
    expect(result).toHaveLength(2);
  });

  it('normaliza espaços dentro de cada parágrafo', () => {
    const desc = 'Linha 1\nLinha 2\n\nLinha 3\nLinha 4';
    const result = descriptionParagraphs(desc);
    expect(result[0]).toBe('Linha 1 Linha 2');
    expect(result[1]).toBe('Linha 3 Linha 4');
  });

  it('ignora parágrafos vazios', () => {
    const desc = '\n\nTexto real.\n\n';
    const result = descriptionParagraphs(desc);
    expect(result).toEqual(['Texto real.']);
  });

  it('retorna array vazio para string vazia', () => {
    expect(descriptionParagraphs('')).toEqual([]);
  });

  it('retorna array vazio para string apenas com espaços', () => {
    expect(descriptionParagraphs('   \n\n   ')).toEqual([]);
  });
});

describe('searchPayload', () => {
  it('inclui title em minúsculo', () => {
    const exp = makeExperience({ title: 'Pirajá Bar' });
    expect(searchPayload(exp)).toContain('pirajá bar');
  });

  it('inclui slug', () => {
    const exp = makeExperience({ slug: 'piraja-bar' });
    expect(searchPayload(exp)).toContain('piraja-bar');
  });

  it('inclui category', () => {
    const exp = makeExperience({ category: 'servicos' });
    expect(searchPayload(exp)).toContain('servicos');
  });

  it('inclui instagram', () => {
    const exp = makeExperience({ instagram: 'barpiraja' });
    expect(searchPayload(exp)).toContain('barpiraja');
  });

  it('inclui instagramUrl', () => {
    const exp = makeExperience({
      instagramUrl: 'https://www.instagram.com/barpiraja/',
    });
    expect(searchPayload(exp)).toContain('instagram.com/barpiraja');
  });

  it('inclui description em minúsculo', () => {
    const exp = makeExperience({ description: 'Desconto especial para clientes' });
    expect(searchPayload(exp)).toContain('desconto especial para clientes');
  });

  it('inclui logradouro do endereço', () => {
    const exp = makeExperience({
      enderecos: [{ logradouro: 'Rua dos Pinheiros', numero: '209' }],
    });
    expect(searchPayload(exp)).toContain('rua dos pinheiros');
  });

  it('inclui número do endereço', () => {
    const exp = makeExperience({
      enderecos: [{ logradouro: 'Rua Teste', numero: '555' }],
    });
    expect(searchPayload(exp)).toContain('555');
  });

  it('inclui complemento do endereço quando presente', () => {
    const exp = makeExperience({
      enderecos: [
        {
          logradouro: 'Av das Nações',
          numero: '100',
          complemento: '3º Piso',
        },
      ],
    });
    expect(searchPayload(exp)).toContain('3º piso');
  });

  it('inclui número e formatado dos telefones', () => {
    const exp = makeExperience({
      enderecos: [
        {
          logradouro: 'Rua A',
          numero: '1',
          telefones: [
            { tipo: 'telefone', numero: '1155552042', formatado: '(11) 5555-2042' },
          ],
        },
      ],
    });
    const payload = searchPayload(exp);
    expect(payload).toContain('1155552042');
    expect(payload).toContain('(11) 5555-2042');
  });

  it('retorna string em minúsculo (locale pt-BR)', () => {
    const exp = makeExperience({ title: 'TÍTULO MAIÚSCULO', slug: 'titulo-maiusculo' });
    const payload = searchPayload(exp);
    expect(payload).toBe(payload.toLocaleLowerCase('pt-BR'));
  });

  it('funciona com endereços sem complemento (usa string vazia)', () => {
    const exp = makeExperience({
      enderecos: [{ logradouro: 'Rua B', numero: '2' }],
    });
    expect(() => searchPayload(exp)).not.toThrow();
  });

  it('funciona com múltiplos endereços', () => {
    const exp = makeExperience({
      enderecos: [
        { logradouro: 'Rua Alpha', numero: '1' },
        { logradouro: 'Rua Beta', numero: '2' },
      ],
    });
    const payload = searchPayload(exp);
    expect(payload).toContain('rua alpha');
    expect(payload).toContain('rua beta');
  });
});

describe('experiencePath', () => {
  it('retorna caminho correto para restaurante', () => {
    const exp = makeExperience({ category: 'restaurantes', slug: 'piraja' });
    expect(experiencePath(exp)).toBe('/piraja/');
  });

  it('retorna caminho correto para serviço', () => {
    const exp = makeExperience({ category: 'servicos', slug: 'barbearia-top' });
    expect(experiencePath(exp)).toBe('/barbearia-top/');
  });

  it('retorna caminho correto para produto', () => {
    const exp = makeExperience({ category: 'produtos', slug: 'blanche-brasil' });
    expect(experiencePath(exp)).toBe('/blanche-brasil/');
  });

  it('termina com barra', () => {
    const exp = makeExperience({ category: 'restaurantes', slug: 'teste' });
    expect(experiencePath(exp)).toMatch(/\/$/);
  });

  it('começa com /', () => {
    const exp = makeExperience({ category: 'restaurantes', slug: 'teste' });
    expect(experiencePath(exp)).toMatch(/^\//);
  });

  it('não usa categoria no caminho público', () => {
    const exp = makeExperience({ category: 'restaurantes', slug: 'teste' });
    expect(experiencePath(exp)).toBe('/teste/');
  });
});
