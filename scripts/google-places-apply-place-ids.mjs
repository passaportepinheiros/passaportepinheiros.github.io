#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const DEFAULT_CSV_IN = path.join(ROOT_DIR, 'data/google-places-place-ids.generated.csv');

const args = parseArgs(process.argv.slice(2));
const csvIn = path.resolve(ROOT_DIR, args.csv ?? DEFAULT_CSV_IN);
const rows = parseCsv(await readFile(csvIn, 'utf8'));
const confirmedRows = rows.filter(isConfirmedRow);
const updates = [];

for (const row of confirmedRows) {
  const placeId = getConfirmedPlaceId(row);
  const file = row.file ? path.resolve(ROOT_DIR, row.file) : '';

  if (!placeId || !file.startsWith(path.join(ROOT_DIR, 'src/content/experiencias'))) {
    continue;
  }

  const original = await readFile(file, 'utf8');
  const updated = upsertFrontmatterValue(original, 'googlePlaceId', placeId);

  if (updated !== original) {
    if (!args.dryRun) {
      await writeFile(file, updated, 'utf8');
    }

    updates.push(file);
  }
}

const action = args.dryRun ? 'Would update' : 'Updated';
console.log(`${action} ${updates.length} experience file(s) with confirmed Google Place IDs.`);

for (const file of updates) {
  console.log(`- ${path.relative(ROOT_DIR, file)}`);
}

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

function parseCsv(text) {
  const records = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }

      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      records.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    records.push(row);
  }

  const [headers, ...body] = records;

  if (!headers?.length) {
    return [];
  }

  return body
    .filter((record) => record.some(Boolean))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
}

function isConfirmedRow(row) {
  return ['1', 's', 'sim', 'true', 'yes', 'y', 'ok', 'x'].includes(
    normalizeConfirmation(row.confirmado),
  );
}

function normalizeConfirmation(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function getConfirmedPlaceId(row) {
  return (row.placeIdConfirmado || row.googlePlaceId || '').trim();
}

function upsertFrontmatterValue(markdown, key, value) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return markdown;
  }

  const frontmatter = match[1];
  const escapedKey = escapeRegExp(key);
  const line = `${key}: "${escapeYamlString(value)}"`;
  let updatedFrontmatter = '';

  if (new RegExp(`^${escapedKey}:`, 'm').test(frontmatter)) {
    updatedFrontmatter = frontmatter.replace(new RegExp(`^${escapedKey}:.*$`, 'm'), line);
  } else if (/^slug:/m.test(frontmatter)) {
    updatedFrontmatter = frontmatter.replace(/^slug:.*$/m, (slugLine) => `${slugLine}\n${line}`);
  } else {
    updatedFrontmatter = `${frontmatter}\n${line}`;
  }

  return markdown.replace(/^---\n[\s\S]*?\n---/, `---\n${updatedFrontmatter}\n---`);
}

function escapeYamlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
