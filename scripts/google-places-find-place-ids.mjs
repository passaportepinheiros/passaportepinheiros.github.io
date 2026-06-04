#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const CONTENT_DIR = path.join(ROOT_DIR, 'src/content/experiencias');
const DEFAULT_JSON_OUT = path.join(ROOT_DIR, 'data/google-places-place-ids.generated.json');
const DEFAULT_CSV_OUT = path.join(ROOT_DIR, 'data/google-places-place-ids.generated.csv');
const PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.businessStatus',
  'places.googleMapsUri',
].join(',');

const args = parseArgs(process.argv.slice(2));
loadDotEnv(path.join(ROOT_DIR, '.env'));

const delayMs = Number(args.delay ?? 250);
const jsonOut = path.resolve(ROOT_DIR, args.jsonOut ?? DEFAULT_JSON_OUT);
const csvOut = path.resolve(ROOT_DIR, args.csvOut ?? DEFAULT_CSV_OUT);

if (args.fromJson) {
  const reportPath = path.resolve(ROOT_DIR, args.fromJson);
  const existingReport = JSON.parse(await readFile(reportPath, 'utf8'));

  await mkdir(path.dirname(csvOut), { recursive: true });
  await writeFile(csvOut, renderCsvReport(existingReport), 'utf8');

  console.log(`Wrote ${path.relative(ROOT_DIR, csvOut)} from ${path.relative(ROOT_DIR, reportPath)}`);
  process.exit(0);
}

const apiKey = process.env.GOOGLE_PLACES_API_KEY;

if (!apiKey) {
  console.error('ERROR: GOOGLE_PLACES_API_KEY is not set. Add it to .env or export it in the shell.');
  process.exit(1);
}

const files = await findMarkdownFiles(CONTENT_DIR);
let experiences = [];

for (const file of files) {
  const parsed = await parseExperience(file);

  if (!parsed) {
    continue;
  }

  experiences.push(parsed);
}

if (args.slug) {
  const wanted = new Set(String(args.slug).split(',').map((slug) => slug.trim()).filter(Boolean));
  experiences = experiences.filter((experience) => wanted.has(experience.slug));
}

if (args.limit) {
  experiences = experiences.slice(0, Number(args.limit));
}

if (!experiences.length) {
  console.error('ERROR: no experiences found for the selected filters.');
  process.exit(1);
}

console.log(`Finding Google Place IDs for ${experiences.length} experience(s)...`);

const results = [];

for (const [index, experience] of experiences.entries()) {
  const prefix = `[${index + 1}/${experiences.length}]`;
  const query = buildSearchQuery(experience);

  console.log(`${prefix} ${experience.slug}: ${query}`);

  try {
    const candidates = await searchPlaces(query, experience.address);
    const rankedCandidates = rankCandidates(candidates, experience);
    const best = rankedCandidates[0] ?? null;
    const confidence = best ? getConfidence(best) : 'not-found';

    results.push({
      ...experience,
      query,
      confidence,
      best,
      candidates: rankedCandidates,
    });

    if (best) {
      const distance = typeof best.distanceMeters === 'number' ? `, ${Math.round(best.distanceMeters)}m` : '';
      console.log(`  -> ${best.id} (${best.displayName}${distance}, ${confidence})`);
    } else {
      console.log('  -> no candidates found');
    }
  } catch (error) {
    results.push({
      ...experience,
      query,
      confidence: 'error',
      best: null,
      candidates: [],
      error: error.message,
    });

    console.log(`  -> ERROR: ${error.message}`);
  }

  if (index < experiences.length - 1 && delayMs > 0) {
    await sleep(delayMs);
  }
}

const generatedAt = new Date().toISOString();
const jsonReport = {
  generatedAt,
  source: 'Google Places API Text Search (New)',
  fieldMask: FIELD_MASK,
  total: results.length,
  summary: summarize(results),
  results: results.map(toJsonResult),
};

await mkdir(path.dirname(jsonOut), { recursive: true });
await mkdir(path.dirname(csvOut), { recursive: true });
await writeFile(jsonOut, `${JSON.stringify(jsonReport, null, 2)}\n`, 'utf8');
await writeFile(csvOut, renderCsvReport(jsonReport), 'utf8');

console.log();
console.log(`Wrote ${path.relative(ROOT_DIR, jsonOut)}`);
console.log(`Wrote ${path.relative(ROOT_DIR, csvOut)}`);
console.log(`Summary: ${JSON.stringify(jsonReport.summary)}`);

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (!arg.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];

    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }

  return parsed;
}

function loadDotEnv(filePath) {
  let contents = '';

  try {
    contents = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (process.env[key]) {
      continue;
    }

    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function findMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await findMarkdownFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function parseExperience(file) {
  const text = await readFile(file, 'utf8');
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatter) {
    return null;
  }

  const fm = frontmatter[1];
  const address = parseFirstAddress(fm);

  return {
    file: path.relative(ROOT_DIR, file),
    title: getScalar(fm, 'title'),
    slug: getScalar(fm, 'slug'),
    category: getScalar(fm, 'category'),
    existingGooglePlaceId: getScalar(fm, 'googlePlaceId'),
    address,
  };
}

function getScalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+?)\\s*$`, 'm'));

  if (!match) {
    return '';
  }

  return stripYamlQuotes(match[1].trim());
}

function parseFirstAddress(frontmatter) {
  const lines = frontmatter.split(/\r?\n/);
  const address = {};
  let insideAddress = false;
  let addressStarted = false;

  for (const line of lines) {
    if (line === 'enderecos:') {
      insideAddress = true;
      continue;
    }

    if (!insideAddress) {
      continue;
    }

    if (/^[A-Za-z_][\w-]*:/.test(line)) {
      break;
    }

    if (/^\s*-\s+/.test(line)) {
      if (addressStarted) {
        break;
      }

      addressStarted = true;
    }

    const addressLine = line.replace(/^\s*-\s+/, '    ');
    const field = addressLine.match(/^\s*(logradouro|numero|bairro|cidade|cep|lat|lng):\s*(.+?)\s*$/);

    if (!field) {
      continue;
    }

    const [, key, rawValue] = field;
    const value = stripYamlQuotes(rawValue.trim());

    if (key === 'lat' || key === 'lng') {
      address[key] = Number(value);
    } else {
      address[key] = value;
    }
  }

  return address;
}

function stripYamlQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function buildSearchQuery(experience) {
  const parts = [
    experience.title,
    experience.address.logradouro,
    experience.address.numero,
    experience.address.bairro ?? 'Pinheiros',
    experience.address.cidade ?? 'São Paulo',
    'SP',
    'Brasil',
  ];

  return parts.filter(Boolean).join(' ');
}

async function searchPlaces(query, address) {
  const body = {
    textQuery: query,
    languageCode: 'pt-BR',
    regionCode: 'BR',
    pageSize: 3,
  };

  if (Number.isFinite(address.lat) && Number.isFinite(address.lng)) {
    body.locationBias = {
      circle: {
        center: {
          latitude: address.lat,
          longitude: address.lng,
        },
        radius: 500,
      },
    };
  }

  const response = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message ?? response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return payload?.places ?? [];
}

function rankCandidates(candidates, experience) {
  return candidates
    .map((candidate) => {
      const displayName = candidate.displayName?.text ?? '';
      const distanceMeters = getDistanceMeters(experience.address, candidate.location);
      const titleScore = getTokenOverlap(experience.title, displayName);
      const addressScore = getAddressScore(experience.address, candidate.formattedAddress ?? '');
      const distanceScore = getDistanceScore(distanceMeters);
      const score = titleScore * 0.55 + addressScore * 0.25 + distanceScore * 0.2;

      return {
        id: candidate.id,
        displayName,
        formattedAddress: candidate.formattedAddress ?? '',
        businessStatus: candidate.businessStatus ?? '',
        googleMapsUri: candidate.googleMapsUri ?? '',
        location: candidate.location ?? null,
        distanceMeters,
        score,
        titleScore,
        addressScore,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function getTokenOverlap(expected, actual) {
  const expectedTokens = getComparableTokens(expected);
  const actualTokens = new Set(getComparableTokens(actual));

  if (!expectedTokens.length || !actualTokens.size) {
    return 0;
  }

  const matches = expectedTokens.filter((token) => actualTokens.has(token)).length;
  return matches / expectedTokens.length;
}

function getAddressScore(address, formattedAddress) {
  const normalized = normalizeText(formattedAddress);
  const normalizedStreet = normalizeStreet(address.logradouro);
  let score = 0;

  if (normalizedStreet && normalized.includes(normalizedStreet)) {
    score += 0.65;
  }

  if (address.numero && normalized.includes(normalizeText(address.numero))) {
    score += 0.35;
  }

  return Math.min(score, 1);
}

function getDistanceScore(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return 0;
  }

  if (distanceMeters <= 50) {
    return 1;
  }

  if (distanceMeters <= 150) {
    return 0.85;
  }

  if (distanceMeters <= 300) {
    return 0.65;
  }

  if (distanceMeters <= 600) {
    return 0.35;
  }

  return 0;
}

function getDistanceMeters(address, location) {
  if (
    !Number.isFinite(address.lat) ||
    !Number.isFinite(address.lng) ||
    !Number.isFinite(location?.latitude) ||
    !Number.isFinite(location?.longitude)
  ) {
    return null;
  }

  return haversine(address.lat, address.lng, location.latitude, location.longitude);
}

function haversine(lat1, lng1, lat2, lng2) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function getComparableTokens(text) {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length >= 2)
    .filter((token) => !['da', 'de', 'do', 'dos', 'das', 'e'].includes(token));
}

function normalizeText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeStreet(street) {
  return normalizeText(street)
    .replace(/^(rua|r|avenida|av|alameda|al|travessa|tv|largo|lg)\s+/, '')
    .trim();
}

function getConfidence(candidate) {
  if (!candidate) {
    return 'not-found';
  }

  if (
    candidate.score >= 0.78 ||
    (candidate.titleScore >= 0.8 && candidate.addressScore >= 0.35) ||
    (candidate.titleScore >= 0.65 && Number.isFinite(candidate.distanceMeters) && candidate.distanceMeters <= 80)
  ) {
    return 'high';
  }

  if (
    candidate.score >= 0.55 ||
    (candidate.titleScore >= 0.5 && Number.isFinite(candidate.distanceMeters) && candidate.distanceMeters <= 250)
  ) {
    return 'medium';
  }

  return 'low';
}

function summarize(results) {
  return results.reduce((summary, result) => {
    summary[result.confidence] = (summary[result.confidence] ?? 0) + 1;
    return summary;
  }, {});
}

function toJsonResult(result) {
  return {
    slug: result.slug,
    title: result.title,
    category: result.category,
    file: result.file,
    query: result.query,
    existingGooglePlaceId: result.existingGooglePlaceId || null,
    confidence: result.confidence,
    googlePlaceId: result.best?.id ?? null,
    displayName: result.best?.displayName ?? null,
    formattedAddress: result.best?.formattedAddress ?? null,
    distanceMeters: typeof result.best?.distanceMeters === 'number'
      ? Math.round(result.best.distanceMeters)
      : null,
    businessStatus: result.best?.businessStatus ?? null,
    googleMapsUri: result.best?.googleMapsUri ?? null,
    error: result.error ?? null,
    candidates: result.candidates.map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      formattedAddress: candidate.formattedAddress,
      distanceMeters: typeof candidate.distanceMeters === 'number'
        ? Math.round(candidate.distanceMeters)
        : null,
      businessStatus: candidate.businessStatus || null,
      googleMapsUri: candidate.googleMapsUri || null,
      score: Number(candidate.score.toFixed(3)),
    })),
  };
}

function renderCsvReport(report) {
  const headers = [
    'confirmado',
    'placeIdConfirmado',
    'observacoes',
    'slug',
    'title',
    'category',
    'confidence',
    'googlePlaceId',
    'displayName',
    'formattedAddress',
    'distanceMeters',
    'businessStatus',
    'googleMapsUri',
    'existingGooglePlaceId',
    'file',
    'query',
    'candidateCount',
    'candidate1Id',
    'candidate1Name',
    'candidate1Address',
    'candidate1DistanceMeters',
    'candidate1Score',
    'candidate2Id',
    'candidate2Name',
    'candidate2Address',
    'candidate2DistanceMeters',
    'candidate2Score',
    'candidate3Id',
    'candidate3Name',
    'candidate3Address',
    'candidate3DistanceMeters',
    'candidate3Score',
  ];

  const rows = report.results.map((result) => {
    const candidate1 = result.candidates?.[0] ?? {};
    const candidate2 = result.candidates?.[1] ?? {};
    const candidate3 = result.candidates?.[2] ?? {};

    return [
      '',
      '',
      '',
      result.slug,
      result.title,
      result.category,
      result.confidence,
      result.googlePlaceId,
      result.displayName,
      result.formattedAddress ?? result.error,
      result.distanceMeters,
      result.businessStatus,
      result.googleMapsUri,
      result.existingGooglePlaceId,
      result.file,
      result.query,
      result.candidates?.length ?? 0,
      candidate1.id,
      candidate1.displayName,
      candidate1.formattedAddress,
      candidate1.distanceMeters,
      candidate1.score,
      candidate2.id,
      candidate2.displayName,
      candidate2.formattedAddress,
      candidate2.distanceMeters,
      candidate2.score,
      candidate3.id,
      candidate3.displayName,
      candidate3.formattedAddress,
      candidate3.distanceMeters,
      candidate3.score,
    ];
  });

  return `${[headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')}\n`;
}

function escapeCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
