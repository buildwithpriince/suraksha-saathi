import { playableScenarios } from '@/content/scenarios';
import type { AttemptResult } from '@/core/assessment/types';
import { attestationBody, certificateBody, pickModules, usableAttestation, type RequiredModule } from '@/core/certificates/issue';
import { signToken } from '@/core/certificates/tokens';
import { verifyCertificate } from '@/core/certificates/verify';
import { listAttempts } from '@/db/attempts';
import { saveCertificate, type CertificateRecord } from '@/db/certificates';
import { newId, nowSeconds } from '@/db/database';
import { getDevice, setAttestation } from '@/db/device';
import { getWorker } from '@/db/workers';
import { deviceSeed } from '@/device/identity';
import { TRUST } from '@/device/trust';

const DEMO_ATTESTATION_DAYS = 365; // matches the backend's approval (docs/06 approve: 365 days)

export type IssueResult =
  | { kind: 'issued'; certificate: CertificateRecord }
  | { kind: 'missing'; missing: string[] }
  | { kind: 'not_approved' }
  | { kind: 'untrusted' };

/** D-029: the modules this build can play (FIRE_01 and GAS_01 since T-30). */
export function requiredModules(): RequiredModule[] {
  return playableScenarios().map((s) => ({ id: s.id, version: s.version, validityDays: s.validityDays }));
}

export function missingModules(workerId: string): string[] {
  const picked = pickModules(requiredModules(), listAttempts<AttemptResult>(workerId).map((a) => a.result));
  return 'missing' in picked ? picked.missing : [];
}

/**
 * docs/04 issuance, fully offline: required passes -> non-expired attestation -> build, sign with
 * the device key, store with its outbox row. In demo mode (D-030) the device attests itself with
 * the TEST root; with a real root key it waits for a backend-approved attestation.
 */
export function issueCertificate(workerId: string): IssueResult {
  if (TRUST.mode === 'unconfigured') return { kind: 'untrusted' };
  const worker = getWorker(workerId);
  const device = getDevice();
  if (worker === null || device === null) throw new Error('worker or device missing');

  const required = requiredModules();
  const picked = pickModules(required, listAttempts<AttemptResult>(workerId).map((a) => a.result));
  if ('missing' in picked) return { kind: 'missing', missing: picked.missing };

  const now = nowSeconds();
  const trusted = { rootPublicKey: TRUST.rootPublicKey, devicePublicKey: device.publicKey, site: device.siteCode, now };
  let attToken = device.attestationToken;
  if (usableAttestation(attToken, trusted) === null) {
    if (TRUST.mode !== 'demo') return { kind: 'not_approved' };
    attToken = signToken(
      'SA1',
      attestationBody({ did: device.id, dpk: device.publicKey, site: device.siteCode, iat: now, exp: now + DEMO_ATTESTATION_DAYS * 86_400 }),
      TRUST.demoRootSeed,
    );
    setAttestation(device.id, attToken);
  }
  if (attToken === null || usableAttestation(attToken, trusted) === null) return { kind: 'not_approved' };

  const body = certificateBody({
    cid: newId(),
    workerId: worker.id,
    workerName: worker.displayName,
    site: device.siteCode,
    mods: picked.mods,
    iat: now,
    validityDays: required.map((m) => m.validityDays),
    lang: worker.preferredLang,
    att: attToken,
  });
  const token = signToken('SS1', body, deviceSeed());
  // Never store a certificate this build could not verify itself
  const check = verifyCertificate(token, { rootPublicKey: TRUST.rootPublicKey, now });
  if (check.status !== 'VALID') throw new Error(`issued certificate did not verify: ${check.status}`);

  const certificate: CertificateRecord = { id: body.cid, workerId: worker.id, token, issuedAt: body.iat, expiresAt: body.exp, statusCache: 'valid' };
  saveCertificate(certificate);
  return { kind: 'issued', certificate };
}
