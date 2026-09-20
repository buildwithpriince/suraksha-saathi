import { describe, expect, test } from 'vitest';

import { workerPayload, type WorkerRecord } from '../sync/payloads';
import { deletedWorker, editedWorker, nextUpdatedAt, workerFields } from './edit';

const RAVI: WorkerRecord = {
  id: '0192f3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b',
  displayName: 'Ravi Munda',
  employeeCode: 'E-102',
  siteCode: 'DHN-01',
  preferredLang: 'hi',
  createdAt: 1_789_000_000,
  updatedAt: 1_789_000_000,
  deletedAt: null,
};

describe('workerFields: the form rules shared by enrol and edit', () => {
  test('trims and collapses spaces; an empty code becomes null', () => {
    expect(workerFields({ displayName: '  Ravi   Munda ', employeeCode: '  ', preferredLang: 'sat' })).toEqual({
      ok: true,
      fields: { displayName: 'Ravi Munda', employeeCode: null, preferredLang: 'sat' },
    });
  });

  test('rejects an empty name, over-long name or code, and an unknown language', () => {
    expect(workerFields({ displayName: '   ', employeeCode: '', preferredLang: 'hi' })).toEqual({ ok: false, error: 'name_required' });
    expect(workerFields({ displayName: 'x'.repeat(25), employeeCode: '', preferredLang: 'hi' })).toEqual({ ok: false, error: 'name_too_long' });
    expect(workerFields({ displayName: 'Ravi', employeeCode: 'c'.repeat(41), preferredLang: 'hi' })).toEqual({ ok: false, error: 'code_too_long' });
    expect(workerFields({ displayName: 'Ravi', employeeCode: '', preferredLang: 'fr' })).toEqual({ ok: false, error: 'bad_language' });
  });

  test('the 24-character limit counts characters, so a 24-letter Devanagari name fits', () => {
    const name = 'क'.repeat(24);
    expect(workerFields({ displayName: name, employeeCode: '', preferredLang: 'hi' })).toMatchObject({ ok: true });
  });
});

describe('edit and soft delete (D-035)', () => {
  test('an edit changes only the fields and moves updatedAt on', () => {
    const edited = editedWorker(RAVI, { displayName: 'Ravi K. Munda', employeeCode: null, preferredLang: 'sat' }, 1_789_000_500);
    expect(edited).toEqual({ ...RAVI, displayName: 'Ravi K. Munda', employeeCode: null, preferredLang: 'sat', updatedAt: 1_789_000_500 });
  });

  test('an edit that changes nothing is null, so nothing is stored or synced', () => {
    expect(editedWorker(RAVI, { displayName: RAVI.displayName, employeeCode: RAVI.employeeCode, preferredLang: RAVI.preferredLang }, 1_789_000_500)).toBeNull();
  });

  test('updatedAt always moves forward, so the server keeps an edit made in the same second', () => {
    expect(nextUpdatedAt(1_789_000_000, 1_789_000_000)).toBe(1_789_000_001);
    expect(nextUpdatedAt(1_789_000_000, 1_788_999_990)).toBe(1_789_000_001); // clock set back
    expect(nextUpdatedAt(1_789_000_000, 1_789_000_900)).toBe(1_789_000_900);
  });

  test('delete sets deletedAt and updatedAt together and keeps everything else', () => {
    const deleted = deletedWorker(RAVI, 1_789_000_900);
    expect(deleted).toEqual({ ...RAVI, deletedAt: 1_789_000_900, updatedAt: 1_789_000_900 });
    expect(workerPayload(deleted!)).toMatchObject({ deletedAt: 1_789_000_900, updatedAt: 1_789_000_900, displayName: 'Ravi Munda' });
  });

  test('a deleted worker cannot be deleted again or edited', () => {
    const deleted = deletedWorker(RAVI, 1_789_000_900)!;
    expect(deletedWorker(deleted, 1_789_001_000)).toBeNull();
    expect(editedWorker(deleted, { displayName: 'New', employeeCode: null, preferredLang: 'hi' }, 1_789_001_000)).toBeNull();
  });

  test('an active worker syncs deletedAt: null', () => {
    expect(workerPayload(RAVI).deletedAt).toBeNull();
  });
});
