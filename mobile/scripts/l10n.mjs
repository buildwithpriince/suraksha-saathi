// content/strings/*.csv -> src/i18n/generated/<locale>.json (docs/07; T-70).
//   node scripts/l10n.mjs build    write the JSON files (committed; never hand-edit them)
//   node scripts/l10n.mjs report   list keys missing per locale; exit 1 if `en` misses any
// Empty cells are left out, so i18next falls back sat -> hi -> en and never shows a raw key.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCALES = ['en', 'hi', 'sat'];
const HERE = dirname(fileURLToPath(import.meta.url));
const STRINGS_DIR = join(HERE, '..', '..', 'content', 'strings');
const OUT_DIR = join(HERE, '..', 'src', 'i18n', 'generated');

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) throw new Error('CSV must be UTF-8 without a BOM (docs/07)');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (quoted) throw new Error('unterminated quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Rows of one table as { key, en, hi, sat, needsReview }. */
export function readTable(text, name) {
  const [header, ...rows] = parseCsv(text);
  const expected = ['key', 'en', 'hi', 'sat', 'needsReview', 'notes'];
  if (header === undefined || expected.some((col, i) => header[i] !== col)) {
    throw new Error(`${name}: header must be ${expected.join(',')}`);
  }
  return rows.map((cells, n) => {
    if (cells.length !== expected.length) throw new Error(`${name} row ${n + 2}: expected 6 columns`);
    const [key, en, hi, sat, needsReview] = cells;
    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(key)) throw new Error(`${name} row ${n + 2}: bad key "${key}"`);
    return { key, en, hi, sat, needsReview: needsReview === 'true' };
  });
}

/** All tables merged into { locale: { key: text } }; duplicate keys across tables are an error. */
export function buildLocales(tables) {
  const out = Object.fromEntries(LOCALES.map((l) => [l, {}]));
  const seen = new Set();
  for (const [name, rows] of tables) {
    for (const row of rows) {
      if (seen.has(row.key)) throw new Error(`${name}: duplicate key ${row.key}`);
      seen.add(row.key);
      for (const locale of LOCALES) {
        if (row[locale] !== '') out[locale][row.key] = row[locale];
      }
    }
  }
  return { locales: out, keys: [...seen].sort() };
}

function loadTables() {
  return readdirSync(STRINGS_DIR)
    .filter((f) => f.endsWith('.csv'))
    .sort()
    .map((f) => [f, readTable(readFileSync(join(STRINGS_DIR, f), 'utf8'), f)]);
}

function sortedObject(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

function main(command) {
  const { locales, keys } = buildLocales(loadTables());
  if (command === 'build') {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const locale of LOCALES) {
      writeFileSync(join(OUT_DIR, `${locale}.json`), `${JSON.stringify(sortedObject(locales[locale]), null, 2)}\n`);
    }
    console.log(`wrote ${LOCALES.length} locales, ${keys.length} keys`);
    return 0;
  }
  if (command === 'report') {
    let enMissing = 0;
    for (const locale of LOCALES) {
      const missing = keys.filter((k) => !(k in locales[locale]));
      if (locale === 'en') enMissing = missing.length;
      console.log(`${locale}: ${keys.length - missing.length}/${keys.length} strings, ${missing.length} missing`);
      for (const k of missing) console.log(`  - ${k}`);
    }
    return enMissing === 0 ? 0 : 1;
  }
  console.error('usage: node scripts/l10n.mjs build|report');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv[2]);
}
