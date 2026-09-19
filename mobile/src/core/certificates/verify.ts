/**
 * docs/04 certificate verification (steps 1-9). Mirrors backend app/crypto/certificates.py and
 * dashboard/src/lib/cert/verify.ts (D-027), synchronously.
 */
import {
  parseAttestation,
  parseCertificate,
  parseRevocationList,
  type AttestationBody,
  type CertificateBody,
  type RevocationListBody,
} from './bodies';
import { publicKeyFromB64url } from './keys';
import { parseBody, splitToken, verifySignature, verifyToken, type SplitToken } from './tokens';

export const CLOCK_SKEW_SECONDS = 300;

/** The exact strings of docs/06 GET /v1/public/verify. */
export type VerifyStatus = 'VALID' | 'EXPIRED' | 'REVOKED' | 'INVALID_FORMAT' | 'INVALID_ATTESTATION' | 'INVALID_SIGNATURE';

/** CHECKED: a root-signed list was applied. NO_LIST / INVALID_LIST: revocation status unknown. */
export type RevocationCheck = 'CHECKED' | 'NO_LIST' | 'INVALID_LIST';

export interface CertificateVerification {
  status: VerifyStatus;
  /** Set only when both signatures verified (VALID, EXPIRED, REVOKED). */
  certificate?: CertificateBody;
  attestation?: AttestationBody;
  /** Unset when verification stopped before the revocation step. */
  revocation?: RevocationCheck;
  revocationsIat?: number;
}

export interface VerifyOptions {
  rootPublicKey: Uint8Array;
  now: number; // unix seconds
  revocationList?: string | null;
}

/** Runs the docs/04 algorithm. Returns a status; never throws. */
export function verifyCertificate(token: string, { rootPublicKey, now, revocationList = null }: VerifyOptions): CertificateVerification {
  // 1. SS1, three canonical parts, body parses as a certificate
  let split: SplitToken;
  let cert: CertificateBody;
  try {
    split = splitToken(token, 'SS1');
    cert = parseBody(split.body, parseCertificate);
  } catch {
    return { status: 'INVALID_FORMAT' };
  }

  // 2-4. Root-signed attestation that covers the issuance time and site
  let att: AttestationBody;
  let deviceKey: Uint8Array;
  try {
    att = verifyToken(cert.att, 'SA1', rootPublicKey, parseAttestation);
    deviceKey = publicKeyFromB64url(att.dpk);
  } catch {
    return { status: 'INVALID_ATTESTATION' };
  }
  if (!(att.iat <= cert.iat && cert.iat <= att.exp) || att.site !== cert.site) {
    return { status: 'INVALID_ATTESTATION' };
  }

  // 5. Signed by the attested device key, over the bytes as transmitted
  try {
    verifySignature(deviceKey, split.signature, split.signingInput);
  } catch {
    return { status: 'INVALID_SIGNATURE' };
  }

  // 6. Not issued in the future, beyond the clock skew allowance
  if (cert.iat > now + CLOCK_SKEW_SECONDS) return { status: 'INVALID_FORMAT' };

  // 7. Revocation list, applied only if it verifies with the root key
  const revocations = revocationList === null ? null : verifyRevocationList(revocationList, rootPublicKey);
  const verified = (status: VerifyStatus): CertificateVerification => ({
    status,
    certificate: cert,
    attestation: att,
    revocation: revocationList === null ? 'NO_LIST' : revocations ? 'CHECKED' : 'INVALID_LIST',
    ...(revocations ? { revocationsIat: revocations.iat } : {}),
  });

  if (revocations?.cids.includes(cert.cid)) return verified('REVOKED');
  // 8-9.
  if (now > cert.exp) return verified('EXPIRED');
  return verified('VALID');
}

/** The list body if the SR1 token verifies with the root key, else null (ignored, docs/04 step 7). */
export function verifyRevocationList(token: string, rootPublicKey: Uint8Array): RevocationListBody | null {
  try {
    return verifyToken(token, 'SR1', rootPublicKey, parseRevocationList);
  } catch {
    return null;
  }
}

export type StatusTone = 'green' | 'amber' | 'red';

/** docs/04 UI mapping: the label key and tone for a status. */
export function statusDisplay(status: VerifyStatus): { key: 'valid' | 'expired' | 'revoked' | 'invalid'; tone: StatusTone } {
  switch (status) {
    case 'VALID':
      return { key: 'valid', tone: 'green' };
    case 'EXPIRED':
      return { key: 'expired', tone: 'amber' };
    case 'REVOKED':
      return { key: 'revoked', tone: 'red' };
    default:
      return { key: 'invalid', tone: 'red' };
  }
}
