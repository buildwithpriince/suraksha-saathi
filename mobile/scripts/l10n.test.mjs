import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  applyCorrections,
  buildLocales,
  formatCsv,
  isStringTable,
  parseCsv,
  readCorrections,
  readTable,
  REVIEW_FILE,
  reviewSheet,
} from './l10n.mjs';

const HEADER = 'key,en,hi,sat,needsReview,notes\n';

describe('parseCsv', () => {
  test('handles quotes, doubled quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\nd,e,f\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['d', 'e', 'f'],
    ]);
  });
  test('rejects a BOM', () => expect(() => parseCsv('﻿key')).toThrow());
  test('rejects an unterminated quote', () => expect(() => parseCsv('"abc')).toThrow());
});

describe('buildLocales', () => {
  test('leaves empty cells out so i18next falls back', () => {
    const rows = readTable(`${HEADER}home.title,Home,घर,,true,\n`, 'UI.csv');
    const { locales } = buildLocales([['UI.csv', rows]]);
    expect(locales.en['home.title']).toBe('Home');
    expect(locales.hi['home.title']).toBe('घर');
    expect('home.title' in locales.sat).toBe(false);
  });
  test('rejects duplicate keys across tables', () => {
    const rows = readTable(`${HEADER}a.b,A,,,false,\n`, 'x.csv');
    expect(() => buildLocales([['x.csv', rows], ['y.csv', rows]])).toThrow(/duplicate/);
  });
  test('rejects a bad header and a bad key', () => {
    expect(() => readTable('key,en\n', 'x.csv')).toThrow(/header/);
    expect(() => readTable(`${HEADER}Bad Key,A,,,false,\n`, 'x.csv')).toThrow(/bad key/);
  });
});

describe('committed string tables', () => {
  const placeholders = (s) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
  const dir = new URL('../../content/strings/', import.meta.url);
  const tables = readdirSync(dir).filter(isStringTable);

  test.each(tables)('%s: every translation keeps the English {{placeholders}}', (table) => {
    for (const row of readTable(readFileSync(new URL(table, dir), 'utf8'), table)) {
      for (const locale of ['hi', 'sat']) {
        if (row[locale] !== '') expect(placeholders(row[locale]), `${row.key} ${locale}`).toEqual(placeholders(row.en));
      }
    }
  });

  // D-047: Santali is written in Ol Chiki. Devanagari only where every language shows the same text.
  const DEVANAGARI_EVERYWHERE = new Set(['lang.hi', 'card.brand.subtitle']);
  test.each(tables)('%s: every sat cell is filled and none is in Devanagari', (table) => {
    for (const row of readTable(readFileSync(new URL(table, dir), 'utf8'), table)) {
      expect(row.sat, `${row.key} sat`).not.toBe('');
      if (!DEVANAGARI_EVERYWHERE.has(row.key)) expect(row.sat, `${row.key} sat`).not.toMatch(/[ऀ-ॿ]/);
    }
  });

  test.each(tables)('%s: formatCsv writes the file back unchanged', (table) => {
    const text = readFileSync(new URL(table, dir), 'utf8');
    expect(formatCsv(parseCsv(text))).toBe(text);
  });
});

describe('Santali review sheet', () => {
  const TABLE = `${HEADER}a.one,One {{n}},एक {{n}},ᱢᱤᱫ {{n}},true,note\na.two,Two,दो,ᱵᱟᱨ,false,\na.three,"Three, 3",तीन,,true,\n`;
  const tables = [['UI.csv', readTable(TABLE, 'UI.csv')]];

  test('the review file is not a string table', () => {
    expect(isStringTable(REVIEW_FILE)).toBe(false);
    expect(isStringTable('UI.csv')).toBe(true);
  });

  test('lists only rows that still need review, with an empty correction column', () => {
    expect(reviewSheet(tables)).toEqual([
      ['key', 'English', 'Hindi', 'Santali draft', 'corrected Santali'],
      ['a.one', 'One {{n}}', 'एक {{n}}', 'ᱢᱤᱫ {{n}}', ''],
      ['a.three', 'Three, 3', 'तीन', '', ''],
    ]);
  });

  test('reads corrections, skipping blank ones and allowing an Excel BOM', () => {
    const sheet = formatCsv(reviewSheet(tables)).replace('ᱢᱤᱫ {{n}},\n', 'ᱢᱤᱫ {{n}}, ᱢᱤᱫᱴᱟᱹᱝ {{n}} \n');
    expect(readCorrections(`﻿${sheet}`, tables)).toEqual({ 'a.one': 'ᱢᱤᱫᱴᱟᱹᱝ {{n}}' });
  });

  test('rejects an unknown key or a correction that loses a placeholder', () => {
    const header = 'key,English,Hindi,Santali draft,corrected Santali\n';
    expect(() => readCorrections(`${header}a.nope,,,,ᱵᱟᱝ\n`, tables)).toThrow(/unknown key/);
    expect(() => readCorrections(`${header}a.one,,,,ᱢᱤᱫ\n`, tables)).toThrow(/placeholders/);
    expect(() => readCorrections('key,en\n', tables)).toThrow(/header/);
  });

  test('applying a correction sets sat, clears needsReview and keeps the rest of the table', () => {
    const out = applyCorrections(TABLE, { 'a.three': 'ᱯᱮ, 3' });
    const rows = readTable(out, 'UI.csv');
    expect(rows[2]).toEqual({ key: 'a.three', en: 'Three, 3', hi: 'तीन', sat: 'ᱯᱮ, 3', needsReview: false });
    expect(rows.slice(0, 2)).toEqual(tables[0][1].slice(0, 2));
    expect(parseCsv(out)[1][5]).toBe('note');
  });
});
