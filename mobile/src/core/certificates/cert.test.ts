import vectors from '@content/trust/test-vectors.json';
import { describe, expect, test } from 'vitest';

import { decodeUtf8Strict, encodeUtf8 } from '../utf8';
import * as b64 from './base64url';
import { attestationBody, certificateBody, pickModules, truncateName, usableAttestation } from './issue';
import { hexToBytes, isPrimeOrderPoint, publicKeyFromB64url, publicKeyOf } from './keys';
import { signToken } from './tokens';
import { ROOT_KEY_PLACEHOLDER, parseRootKeyFile, resolveTrust } from './trust';
import { verifyCertificate, type VerifyStatus } from './verify';

// TEST KEYS ONLY (docs/04 test vectors)
const root = publicKeyFromB64url(vectors.root_public_key);
const rootSeed = hexToBytes(vectors.root_seed_hex);
const deviceSeed = hexToBytes(vectors.device_seed_hex);
const tokens: Record<string, string> = { att: vectors.att, cert: vectors.cert, tampered: vectors.tampered, rev: vectors.rev };
const V1_NOW = 1789100000;
const DEMO = { rootSeedHex: vectors.root_seed_hex, rootPublicKey: vectors.root_public_key };

function bodyOf(token: string): Record<string, unknown> {
  return JSON.parse(decodeUtf8Strict(b64.decode(token.split('.')[1]!))) as Record<string, unknown>;
}
const certBody = () => bodyOf(vectors.cert);

function status(token: string, now = V1_NOW, revocationList?: string): VerifyStatus {
  return verifyCertificate(token, { rootPublicKey: root, now, revocationList: revocationList ?? null }).status;
}

describe('docs/04 shared vectors', () => {
  test.each(vectors.cases)('$id -> $expected', (c) => {
    const rev = 'rev' in c ? tokens[c.rev as string] : undefined;
    expect(status(tokens[c.token]!, c.now, rev)).toBe(c.expected);
  });

  test('V1 exposes the certificate fields and revocation state', () => {
    const r = verifyCertificate(vectors.cert, { rootPublicKey: root, now: V1_NOW });
    expect(r.certificate?.wn).toBe('Ravi Munda');
    expect(r.certificate?.mods.map((m) => m.id)).toEqual(['FIRE_01', 'GAS_01']);
    expect(r.revocation).toBe('NO_LIST');
  });

  test('the V4 list is applied and dated', () => {
    const r = verifyCertificate(vectors.cert, { rootPublicKey: root, now: 1789600000, revocationList: vectors.rev });
    expect(r.revocation).toBe('CHECKED');
    expect(r.revocationsIat).toBe(1789500000);
  });

  test('the seeds match the published public keys', () => {
    expect(b64.encode(publicKeyOf(rootSeed))).toBe(vectors.root_public_key);
    expect(b64.encode(publicKeyOf(deviceSeed))).toBe(vectors.device_public_key);
    expect(isPrimeOrderPoint(publicKeyFromB64url(vectors.device_public_key))).toBe(true);
  });

  test('signing reproduces the vector attestation byte for byte', () => {
    expect(signToken('SA1', attestationBody(bodyOf(vectors.att) as never), rootSeed)).toBe(vectors.att);
  });
});

describe('issuance', () => {
  test('certificateBody + signToken reproduce the vector certificate byte for byte', () => {
    const body = certificateBody({
      cid: '0191f6a0-0000-7000-8000-00000000c001',
      workerId: '0191f6a0-0000-7000-8000-00000000a001',
      workerName: 'Ravi Munda',
      site: 'DHN-01',
      mods: [
        { id: 'FIRE_01', v: 1, s: 86 },
        { id: 'GAS_01', v: 1, s: 91 },
      ],
      iat: 1789000000,
      validityDays: [365, 365],
      lang: 'hi',
      att: vectors.att,
    });
    expect(signToken('SS1', body, deviceSeed)).toBe(vectors.cert);
  });

  test('exp uses the shortest validity; names are cut to 24 characters', () => {
    const body = certificateBody({
      cid: 'c',
      workerId: 'w',
      workerName: 'रवि मुंडा रवि मुंडा रवि मुंडा रवि',
      site: 'DHN-01',
      mods: [],
      iat: 1000,
      validityDays: [365, 30],
      lang: 'hi',
      att: 'SA1.x.y',
    });
    expect(body.exp).toBe(1000 + 30 * 86400);
    expect([...body.wn]).toHaveLength(24);
    expect(truncateName('Ravi')).toBe('Ravi');
  });

  test('pickModules takes the newest passing attempt on the current version', () => {
    const required = [{ id: 'FIRE_01', version: 1, validityDays: 365 }];
    const attempts = [
      { scenarioId: 'FIRE_01', scenarioVersion: 1, scorePercent: 80, passed: true, startedAt: 10 },
      { scenarioId: 'FIRE_01', scenarioVersion: 1, scorePercent: 95, passed: true, startedAt: 20 },
      { scenarioId: 'FIRE_01', scenarioVersion: 1, scorePercent: 40, passed: false, startedAt: 30 },
      { scenarioId: 'FIRE_01', scenarioVersion: 0, scorePercent: 99, passed: true, startedAt: 40 },
    ];
    expect(pickModules(required, attempts)).toEqual({ mods: [{ id: 'FIRE_01', v: 1, s: 95 }] });
    expect(pickModules([...required, { id: 'GAS_01', version: 1, validityDays: 365 }], attempts)).toEqual({ missing: ['GAS_01'] });
  });

  test('usableAttestation checks root signature, device key, site and time', () => {
    const opts = { rootPublicKey: root, devicePublicKey: vectors.device_public_key, site: 'DHN-01', now: 1789000000 };
    expect(usableAttestation(vectors.att, opts)?.site).toBe('DHN-01');
    expect(usableAttestation(null, opts)).toBeNull();
    expect(usableAttestation(vectors.att, { ...opts, site: 'JSR-02' })).toBeNull();
    expect(usableAttestation(vectors.att, { ...opts, devicePublicKey: vectors.root_public_key })).toBeNull();
    expect(usableAttestation(vectors.att, { ...opts, now: 1819536001 })).toBeNull();
    expect(usableAttestation(vectors.att, { ...opts, rootPublicKey: publicKeyFromB64url(vectors.device_public_key) })).toBeNull();
  });
});

describe('trust (D-030)', () => {
  test('the committed placeholder enables demo keys', () => {
    const trust = resolveTrust(`${ROOT_KEY_PLACEHOLDER} (generated by backend/app/tools/gen_root_key.py)\n`, DEMO);
    expect(trust.mode).toBe('demo');
    if (trust.mode === 'demo') expect(trust.rootPublicKey).toEqual(root);
  });

  test('a real committed key disables demo keys: no seed, only that root', () => {
    const real = b64.encode(publicKeyOf(new Uint8Array(32).fill(7)));
    const trust = resolveTrust(`${real}\n`, DEMO);
    expect(trust.mode).toBe('real');
    expect('demoRootSeed' in trust).toBe(false);
    if (trust.mode === 'real') {
      expect(verifyCertificate(vectors.cert, { rootPublicKey: trust.rootPublicKey, now: V1_NOW }).status).toBe('INVALID_ATTESTATION');
    }
  });

  test('the TEST key committed as if real, or a garbled file, fails closed', () => {
    expect(resolveTrust(`${vectors.root_public_key}\n`, DEMO).mode).toBe('unconfigured');
    expect(resolveTrust('not a key', DEMO).mode).toBe('unconfigured');
    expect(resolveTrust(`${ROOT_KEY_PLACEHOLDER}\n`, { ...DEMO, rootSeedHex: vectors.device_seed_hex }).mode).toBe('unconfigured');
  });

  test('parseRootKeyFile', () => {
    expect(parseRootKeyFile('REPLACE_WITH_REAL_ROOT_PUBLIC_KEY\n')).toBeNull();
    expect(parseRootKeyFile(`${vectors.root_public_key}\n`)).toEqual(root);
  });
});

describe('strict base64url (D-013)', () => {
  test('round trips', () => {
    const data = Uint8Array.from([0, 1, 2, 250, 251, 252, 253]);
    expect(b64.decode(b64.encode(data))).toEqual(data);
  });
  test.each(['QR', 'QQ==', 'Q', 'QQ+/', 'Q Q'])('rejects %s', (bad) => {
    expect(() => b64.decode(bad)).toThrow();
  });
  test('accepts QQ', () => expect(b64.decode('QQ')).toEqual(Uint8Array.from([65])));
});

describe('INVALID_FORMAT', () => {
  test.each([
    ['empty', ''],
    ['wrong prefix', vectors.cert.replace(/^SS1/, 'SA1')],
    ['two parts', vectors.cert.slice(0, vectors.cert.lastIndexOf('.'))],
    ['padded signature', `${vectors.cert}==`],
    ['63-byte signature', vectors.cert.slice(0, -3)],
    ['garbage', 'hello'],
  ])('%s', (_name, token) => {
    expect(status(token)).toBe('INVALID_FORMAT');
  });

  test('BOM body', () => {
    const json = encodeUtf8(JSON.stringify(certBody()));
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...json]);
    const sig = vectors.cert.split('.')[2];
    expect(status(`SS1.${b64.encode(bom)}.${sig}`)).toBe('INVALID_FORMAT');
  });

  test('invalid UTF-8 body', () => {
    const sig = vectors.cert.split('.')[2];
    expect(status(`SS1.${b64.encode(Uint8Array.from([0x7b, 0xff, 0x7d]))}.${sig}`)).toBe('INVALID_FORMAT');
  });

  test('float iat', () => {
    expect(status(signToken('SS1', { ...certBody(), iat: 1789000000.5 }, deviceSeed))).toBe('INVALID_FORMAT');
  });

  test('missing field', () => {
    const { wn: _wn, ...rest } = certBody();
    expect(status(signToken('SS1', rest, deviceSeed))).toBe('INVALID_FORMAT');
  });

  test('issued in the future beyond the skew', () => {
    const iat = certBody().iat as number;
    expect(status(vectors.cert, iat - 301)).toBe('INVALID_FORMAT');
    expect(status(vectors.cert, iat - 300)).toBe('VALID');
  });
});

describe('INVALID_ATTESTATION', () => {
  test('attestation not signed by the root', () => {
    const att = signToken('SA1', { did: 'x', dpk: vectors.device_public_key, site: 'DHN-01', iat: 1788000000, exp: 1819536000 }, deviceSeed);
    expect(status(signToken('SS1', { ...certBody(), att }, deviceSeed))).toBe('INVALID_ATTESTATION');
  });

  test('small-order device key (D-015)', () => {
    const identity = b64.encode(Uint8Array.from([1, ...new Array<number>(31).fill(0)]));
    const att = signToken('SA1', { did: 'x', dpk: identity, site: 'DHN-01', iat: 1788000000, exp: 1819536000 }, rootSeed);
    expect(status(signToken('SS1', { ...certBody(), att }, deviceSeed))).toBe('INVALID_ATTESTATION');
  });

  test('site mismatch', () => {
    expect(status(signToken('SS1', { ...certBody(), site: 'JSR-02' }, deviceSeed))).toBe('INVALID_ATTESTATION');
  });

  test('issued outside the attestation window', () => {
    expect(status(signToken('SS1', { ...certBody(), iat: 1787999999 }, deviceSeed))).toBe('INVALID_ATTESTATION');
  });
});

describe('revocation list handling', () => {
  test('a forged list is ignored and reported as invalid', () => {
    const forged = signToken('SR1', { iat: 1789500000, cids: [certBody().cid] }, deviceSeed);
    const r = verifyCertificate(vectors.cert, { rootPublicKey: root, now: V1_NOW, revocationList: forged });
    expect(r.status).toBe('VALID');
    expect(r.revocation).toBe('INVALID_LIST');
  });

  test('revocation wins over expiry', () => {
    expect(status(vectors.cert, 1830000000, vectors.rev)).toBe('REVOKED');
  });
});
