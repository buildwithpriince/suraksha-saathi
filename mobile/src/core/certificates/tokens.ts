/**
 * docs/04 compact tokens: <PREFIX>.<base64url(body JSON)>.<base64url(Ed25519 signature)>.
 * Signatures cover the ASCII bytes of <PREFIX>.<base64url(body)> exactly as transmitted.
 * Verifiers split on the LAST dot and never re-serialize JSON.
 * Ported from dashboard/src/lib/cert/tokens.ts (D-027) with noble's sync API (Hermes has no
 * WebCrypto) and the core UTF-8 codec (Hermes TextDecoder support varies).
 */
import { decodeUtf8Strict, encodeUtf8 } from '../utf8';
import * as b64 from './base64url';
import { ed } from './ed25519';

export type Prefix = 'SA1' | 'SS1' | 'SR1';

export const SIGNATURE_BYTES = 64;

export class TokenError extends Error {}
/** Wrong prefix or shape, non-canonical base64url, or a body that does not parse. */
export class MalformedToken extends TokenError {}
/** Well-formed token whose signature does not verify. */
export class BadSignature extends TokenError {}

export interface SplitToken {
  signingInput: Uint8Array;
  body: Uint8Array;
  signature: Uint8Array;
}

export function splitToken(token: string, prefix: Prefix): SplitToken {
  const lastDot = token.lastIndexOf('.');
  const signingInput = lastDot < 0 ? '' : token.slice(0, lastDot);
  const firstDot = signingInput.indexOf('.');
  if (firstDot < 0) throw new MalformedToken(`not a 3-part ${prefix} token`);
  const bodyText = signingInput.slice(firstDot + 1);
  if (signingInput.slice(0, firstDot) !== prefix || bodyText.includes('.')) {
    throw new MalformedToken(`not a 3-part ${prefix} token`);
  }
  let body: Uint8Array;
  let signature: Uint8Array;
  try {
    body = b64.decode(bodyText);
    signature = b64.decode(token.slice(lastDot + 1));
  } catch {
    throw new MalformedToken(`${prefix} segment is not canonical base64url`);
  }
  if (signature.length !== SIGNATURE_BYTES) {
    throw new MalformedToken(`${prefix} signature is not ${SIGNATURE_BYTES} bytes`);
  }
  // ASCII is guaranteed: the prefix matched and the body passed the base64url alphabet check
  return { signingInput: encodeUtf8(signingInput), body, signature };
}

/** Strict UTF-8 (no BOM), RFC 8259 JSON (no NaN/Infinity), an object with the body's JSON types. */
export function parseBody<T>(body: Uint8Array, parse: (value: unknown) => T): T {
  try {
    const value: unknown = JSON.parse(decodeUtf8Strict(body), (_key, v: unknown) => {
      // 1e999 parses to Infinity; the backend rejects numbers that overflow
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('number overflows');
      return v;
    });
    return parse(value);
  } catch {
    throw new MalformedToken('body is not a valid token body');
  }
}

export function verifySignature(publicKey: Uint8Array, signature: Uint8Array, signingInput: Uint8Array): void {
  let ok = false;
  try {
    // RFC 8032 verification, not the library's ZIP215 default (T-18)
    ok = ed.verify(signature, signingInput, publicKey, { zip215: false });
  } catch {
    ok = false;
  }
  if (!ok) throw new BadSignature('signature does not verify');
}

/** Verify first, then decode the body. */
export function verifyToken<T>(token: string, prefix: Prefix, publicKey: Uint8Array, parse: (value: unknown) => T): T {
  const { signingInput, body, signature } = splitToken(token, prefix);
  verifySignature(publicKey, signature, signingInput);
  return parseBody(body, parse);
}

/**
 * Compact JSON in the object's key order (docs/04 field order), signed over the transmitted bytes.
 * `seed` is the raw 32-byte Ed25519 secret; never log it.
 */
export function signToken(prefix: Prefix, body: object, seed: Uint8Array): string {
  const signingInput = `${prefix}.${b64.encode(encodeUtf8(JSON.stringify(body)))}`;
  const signature = ed.sign(encodeUtf8(signingInput), seed);
  return `${signingInput}.${b64.encode(signature)}`;
}
