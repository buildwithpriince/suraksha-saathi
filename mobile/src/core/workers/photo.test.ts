import { describe, expect, it } from 'vitest';

import { latestPhotoName, photoFileName, stalePhotoNames } from './photo';

const A = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const B = '0192f3a4-5b6c-7d8e-9f01-000000000000';

describe('worker photo files', () => {
  it('names a photo by worker and time taken', () => {
    expect(photoFileName(A.toUpperCase(), 1727600000123.7)).toBe(`${A}-1727600000123.jpg`);
  });

  it('finds the newest photo of a worker and ignores other workers and stray files', () => {
    const names = [photoFileName(A, 100), photoFileName(A, 300), photoFileName(B, 900), `${A}-abc.jpg`, `${A}-200.png`, 'notes.txt'];
    expect(latestPhotoName(names, A)).toBe(photoFileName(A, 300));
    expect(latestPhotoName(names, B)).toBe(photoFileName(B, 900));
    expect(latestPhotoName(['notes.txt'], A)).toBeNull();
  });

  it('compares times as numbers, not text', () => {
    expect(latestPhotoName([photoFileName(A, 99), photoFileName(A, 100)], A)).toBe(photoFileName(A, 100));
  });

  it('lists the older photos of the same worker to delete', () => {
    const names = [photoFileName(A, 100), photoFileName(A, 300), photoFileName(B, 200)];
    expect(stalePhotoNames(names, A, photoFileName(A, 300))).toEqual([photoFileName(A, 100)]);
    expect(stalePhotoNames(names, A, null)).toEqual([photoFileName(A, 100), photoFileName(A, 300)]);
  });
});
