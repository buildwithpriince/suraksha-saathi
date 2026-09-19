import QRCode from 'qrcode';
import { describe, expect, test } from 'vitest';

import { idCardSheetHtml, parseScannedCard, qrSvg, workerCardText } from './idCard';

const ID = '0192f3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b';

describe('worker card text (D-034)', () => {
  test('is SW1: and the lowercase worker UUID, and parses back', () => {
    expect(workerCardText(ID.toUpperCase())).toBe(`SW1:${ID}`);
    expect(parseScannedCard(workerCardText(ID))).toEqual({ kind: 'worker', workerId: ID });
  });

  test('scanner whitespace and an uppercase UUID are accepted', () => {
    expect(parseScannedCard(`  SW1:${ID.toUpperCase()}\n`)).toEqual({ kind: 'worker', workerId: ID });
  });

  test('a certificate, an exit marker or a broken card are not worker cards', () => {
    expect(parseScannedCard('SS1.eyJjaWQiOiJ4In0.c2ln')).toEqual({ kind: 'certificate' });
    expect(parseScannedCard('EXIT_A')).toEqual({ kind: 'other' });
    expect(parseScannedCard('SW1:not-a-uuid')).toEqual({ kind: 'other' });
    expect(parseScannedCard(`sw1:${ID}`)).toEqual({ kind: 'other' });
  });

  test('only a UUID can go on a card', () => {
    expect(() => workerCardText('ravi')).toThrow();
  });
});

describe('printable QR', () => {
  const text = workerCardText(ID);
  const { modules, version } = QRCode.create(text, { errorCorrectionLevel: 'Q' });
  const svg = qrSvg(text);

  test('draws every dark module once, inside a 4-module quiet zone', () => {
    let dark = 0;
    for (let i = 0; i < modules.size * modules.size; i++) if (modules.data[i]) dark++;
    expect(svg.match(/M\d+ \d+h1v1h-1z/g)).toHaveLength(dark);
    expect(svg).toContain(`viewBox="0 0 ${modules.size + 8} ${modules.size + 8}"`);
  });

  test('is not transposed: the always-dark module sits at row 4V+9, column 8', () => {
    expect(svg).toContain(`M${8 + 4} ${4 * version + 9 + 4}h1v1h-1z`);
  });
});

describe('ID card sheet', () => {
  test('one card per worker, with its QR, name and lines, all escaped', () => {
    const html = idCardSheetHtml(
      [
        { name: 'Ravi <b>Munda</b>', lines: ['Site: DHN-01', 'Code: "A&B"'], qrText: workerCardText(ID) },
        { name: 'सुनीता', lines: [], qrText: workerCardText('0192f3c4-5d6e-7f80-9a1b-2c3d4e5f6a7c') },
      ],
      { heading: 'Suraksha Saathi', title: 'Worker ID card' },
    );
    expect(html.match(/class="card"/g)).toHaveLength(2);
    expect(html.match(/<svg /g)).toHaveLength(2);
    expect(html).toContain('Ravi &lt;b&gt;Munda&lt;/b&gt;');
    expect(html).toContain('Code: &quot;A&amp;B&quot;');
    expect(html).toContain('सुनीता');
    expect(html).not.toContain('<b>');
  });
});
