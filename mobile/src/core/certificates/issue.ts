/** docs/04 "Issuance (on device, offline)": pure helpers; the app glue signs and stores. */
import { parseAttestation, type AttestationBody, type CertificateBody, type ModuleScore } from './bodies';
import { verifyToken } from './tokens';

/** docs/04: `wn` max 24 characters (keeps the QR small). Counted in code points. */
export const MAX_NAME_CHARS = 24;
const DAY_SECONDS = 86_400;

export interface RequiredModule {
  id: string;
  version: number;
  validityDays: number;
}

export interface AttemptSummary {
  scenarioId: string;
  scenarioVersion: number;
  scorePercent: number;
  passed: boolean;
  startedAt: number;
}

/**
 * docs/04 step 1: a passing attempt for every required module. Uses each module's newest passing
 * attempt on the current scenario version; `mods` follows the order of `required`.
 */
export function pickModules(required: readonly RequiredModule[], attempts: readonly AttemptSummary[]): { mods: ModuleScore[] } | { missing: string[] } {
  const mods: ModuleScore[] = [];
  const missing: string[] = [];
  for (const m of required) {
    const newest = attempts
      .filter((a) => a.passed && a.scenarioId === m.id && a.scenarioVersion === m.version)
      .reduce<AttemptSummary | null>((best, a) => (best === null || a.startedAt > best.startedAt ? a : best), null);
    if (newest === null) missing.push(m.id);
    else mods.push({ id: m.id, v: m.version, s: newest.scorePercent });
  }
  return missing.length > 0 ? { missing } : { mods };
}

export function truncateName(name: string): string {
  return [...name].slice(0, MAX_NAME_CHARS).join('');
}

/** The SS1 body in docs/04 field order. `exp = iat + min(validityDays) × 86400`. */
export function certificateBody(input: {
  cid: string;
  workerId: string;
  workerName: string;
  site: string;
  mods: ModuleScore[];
  iat: number;
  validityDays: readonly number[];
  lang: string;
  att: string;
}): CertificateBody {
  if (input.validityDays.length === 0) throw new Error('no modules');
  return {
    cid: input.cid.toLowerCase(),
    wid: input.workerId.toLowerCase(),
    wn: truncateName(input.workerName),
    site: input.site,
    mods: input.mods,
    iat: input.iat,
    exp: input.iat + Math.min(...input.validityDays) * DAY_SECONDS,
    lang: input.lang,
    att: input.att,
  };
}

/** The SA1 body in docs/04 field order. */
export function attestationBody(input: AttestationBody): AttestationBody {
  return { did: input.did, dpk: input.dpk, site: input.site, iat: input.iat, exp: input.exp };
}

/**
 * docs/04 step 2: the stored attestation, if it is root-signed, for this device key and site, and
 * covers `now`. Otherwise null ("Device not approved yet").
 */
export function usableAttestation(
  token: string | null,
  opts: { rootPublicKey: Uint8Array; devicePublicKey: string; site: string; now: number },
): AttestationBody | null {
  if (token === null) return null;
  try {
    const att = verifyToken(token, 'SA1', opts.rootPublicKey, parseAttestation);
    const ok = att.dpk === opts.devicePublicKey && att.site === opts.site && att.iat <= opts.now && opts.now <= att.exp;
    return ok ? att : null;
  } catch {
    return null;
  }
}
