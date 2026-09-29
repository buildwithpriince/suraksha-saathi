import { describe, expect, it } from 'vitest';

import { CARD_HEIGHT_MM, CARD_WIDTH_MM, cardHeightPx, cardWidthPx, cardWorkerId, pxPerMm } from './walletCard';

describe('wallet card geometry', () => {
  it('keeps the ID-1 aspect ratio at any width', () => {
    expect(cardHeightPx(856)).toBeCloseTo(540);
    expect(cardHeightPx(328) / 328).toBeCloseTo(CARD_HEIGHT_MM / CARD_WIDTH_MM);
  });

  it('maps millimetres to pixels for the drawn width', () => {
    expect(pxPerMm(856)).toBeCloseTo(10);
    // 300 dpi export: 85.6 mm is 1011 px
    expect(pxPerMm(1011) * 25.4).toBeCloseTo(300, 0);
  });

  it('fits the available width up to a maximum', () => {
    expect(cardWidthPx(328, 420)).toBe(328);
    expect(cardWidthPx(700, 420)).toBe(420);
    expect(cardWidthPx(-5, 420)).toBe(0);
  });
});

describe('cardWorkerId', () => {
  const id = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

  it('uses the employee code when there is one', () => {
    expect(cardWorkerId({ id, employeeCode: 'EMP-104' })).toBe('EMP-104');
    expect(cardWorkerId({ id, employeeCode: '  EMP-104 ' })).toBe('EMP-104');
  });

  it('falls back to the start of the UUID in capitals', () => {
    expect(cardWorkerId({ id, employeeCode: null })).toBe('0192F3A4');
    expect(cardWorkerId({ id, employeeCode: '   ' })).toBe('0192F3A4');
  });
});
