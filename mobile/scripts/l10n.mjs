// content/strings/*.csv -> src/i18n/generated/<locale>.json (docs/07; T-70).
//   node scripts/l10n.mjs build           write the JSON files (committed; never hand-edit them)
//   node scripts/l10n.mjs report          list keys missing per locale; exit 1 if `en` misses any
//   node scripts/l10n.mjs export-review   write content/strings/santali-review.csv for a Santali speaker
//   node scripts/l10n.mjs import-review   apply its "corrected Santali" column, clear needsReview, build
// Empty cells are left out, so i18next falls back sat -> hi -> en and never shows a raw key.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCALES = ['en', 'hi', 'sat'];
const HERE = dirname(fileURLToPath(import.meta.url));
const STRINGS_DIR = join(HERE, '..', '..', 'content', 'strings');
const OUT_DIR = join(HERE, '..', 'src', 'i18n', 'generated');
const TABLE_HEADER = ['key', 'en', 'hi', 'sat', 'needsReview', 'notes'];

/** The sheet a Santali speaker fills in (D-047). It sits beside the string tables but is not one. */
export const REVIEW_FILE = 'santali-review.csv';
export const REVIEW_HEADER = ['key', 'English', 'Hindi', 'Santali draft', 'corrected Santali'];

export function isStringTable(file) {
  return file.endsWith('.csv') && file !== REVIEW_FILE;
}

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

/** RFC 4180 CSV with LF line ends; a field is quoted only when it holds a comma, quote or line break. */
export function formatCsv(rows) {
  const field = (s) => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  return `${rows.map((r) => r.map(field).join(',')).join('\n')}\n`;
}

/** Rows of one table as { key, en, hi, sat, needsReview }. */
export function readTable(text, name) {
  const [header, ...rows] = parseCsv(text);
  const expected = TABLE_HEADER;
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

const placeholders = (s) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');

/** The review sheet: every row still marked needsReview, with an empty column for the correction. */
export function reviewSheet(tables) {
  const rows = tables.flatMap(([, rows]) => rows.filter((r) => r.needsReview).map((r) => [r.key, r.en, r.hi, r.sat, '']));
  return [REVIEW_HEADER, ...rows];
}

/**
 * Corrections from a filled-in review sheet as { key: santali }. Rows with an empty "corrected
 * Santali" cell are skipped. An unknown key, or a correction that drops or adds a {{placeholder}},
 * is an error, so a typo can't break a screen. A BOM (Excel's "CSV UTF-8") is allowed here.
 */
export function readCorrections(text, tables) {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  if (header === undefined || REVIEW_HEADER.some((col, i) => header[i] !== col)) {
    throw new Error(`${REVIEW_FILE}: header must be ${REVIEW_HEADER.join(',')}`);
  }
  const byKey = new Map(tables.flatMap(([, rows]) => rows.map((r) => [r.key, r])));
  const corrections = {};
  const errors = [];
  rows.forEach((cells, n) => {
    const key = cells[0] ?? '';
    const fixed = (cells[4] ?? '').trim();
    if (fixed === '') return;
    const row = byKey.get(key);
    if (row === undefined) errors.push(`row ${n + 2}: unknown key "${key}"`);
    else if (placeholders(fixed) !== placeholders(row.en)) errors.push(`row ${n + 2} (${key}): keep the English {{placeholders}}`);
    else corrections[key] = fixed;
  });
  if (errors.length > 0) throw new Error(`${REVIEW_FILE}:\n  ${errors.join('\n  ')}`);
  return corrections;
}

/** A table's CSV text with corrections applied: sat replaced and needsReview=false; notes kept. */
export function applyCorrections(text, corrections) {
  const [header, ...rows] = parseCsv(text);
  const out = rows.map((cells) => {
    const fixed = corrections[cells[0]];
    return fixed === undefined ? cells : [cells[0], cells[1], cells[2], fixed, 'false', cells[5]];
  });
  return formatCsv([header, ...out]);
}

function tableFiles() {
  return readdirSync(STRINGS_DIR).filter(isStringTable).sort();
}

function loadTables() {
  return tableFiles().map((f) => [f, readTable(readFileSync(join(STRINGS_DIR, f), 'utf8'), f)]);
}

function sortedObject(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

function build() {
  const { locales, keys } = buildLocales(loadTables());
  mkdirSync(OUT_DIR, { recursive: true });
  for (const locale of LOCALES) {
    writeFileSync(join(OUT_DIR, `${locale}.json`), `${JSON.stringify(sortedObject(locales[locale]), null, 2)}\n`);
  }
  console.log(`wrote ${LOCALES.length} locales, ${keys.length} keys`);
}

function report() {
  const tables = loadTables();
  const { locales, keys } = buildLocales(tables);
  const drafts = tables.flatMap(([, rows]) => rows).filter((r) => r.needsReview && r.sat !== '').length;
  let enMissing = 0;
  for (const locale of LOCALES) {
    const missing = keys.filter((k) => !(k in locales[locale]));
    if (locale === 'en') enMissing = missing.length;
    const review = locale === 'sat' ? `, ${drafts} drafts awaiting native-speaker review` : '';
    console.log(`${locale}: ${keys.length - missing.length}/${keys.length} strings, ${missing.length} missing${review}`);
    for (const k of missing) console.log(`  - ${k}`);
  }
  return enMissing === 0 ? 0 : 1;
}

function exportReview(force) {
  const path = join(STRINGS_DIR, REVIEW_FILE);
  const tables = loadTables();
  // Don't overwrite a speaker's corrections that have not been imported yet
  if (existsSync(path) && !force) {
    const stillDraft = new Set(tables.flatMap(([, rows]) => rows.filter((r) => r.needsReview).map((r) => r.key)));
    const pending = Object.keys(readCorrections(readFileSync(path, 'utf8'), tables)).filter((k) => stillDraft.has(k));
    if (pending.length > 0) {
      console.error(`${REVIEW_FILE} has ${pending.length} corrections not imported yet: run l10n:import-review, or pass --force to discard them`);
      return 1;
    }
  }
  const sheet = reviewSheet(tables);
  // The BOM makes Excel open the file as UTF-8 instead of garbling the Ol Chiki
  writeFileSync(path, `﻿${formatCsv(sheet)}`);
  console.log(`wrote ${REVIEW_FILE}: ${sheet.length - 1} rows to review`);
  return 0;
}

function importReview() {
  const path = join(STRINGS_DIR, REVIEW_FILE);
  if (!existsSync(path)) {
    console.error(`${REVIEW_FILE} not found: run l10n:export-review first`);
    return 1;
  }
  const corrections = readCorrections(readFileSync(path, 'utf8'), loadTables());
  for (const file of tableFiles()) {
    const tablePath = join(STRINGS_DIR, file);
    const before = readFileSync(tablePath, 'utf8');
    const after = applyCorrections(before, corrections);
    if (after !== before) writeFileSync(tablePath, after);
  }
  console.log(`imported ${Object.keys(corrections).length} corrected Santali strings (needsReview=false)`);
  build();
  return 0;
}

function main(command, args) {
  switch (command) {
    case 'build':
      build();
      return 0;
    case 'report':
      return report();
    case 'export-review':
      return exportReview(args.includes('--force'));
    case 'import-review':
      return importReview();
    default:
      console.error('usage: node scripts/l10n.mjs build | report | export-review [--force] | import-review');
      return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv[2], process.argv.slice(3));
}
