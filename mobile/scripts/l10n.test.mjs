import { describe, expect, test } from 'vitest';

import { buildLocales, parseCsv, readTable } from './l10n.mjs';

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
