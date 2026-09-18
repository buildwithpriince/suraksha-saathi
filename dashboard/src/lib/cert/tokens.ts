/**
 * docs/04 compact tokens: <PREFIX>.<base64url(body JSON)>.<base64url(Ed25519 signature)>.
 * Signatures cover the ASCII bytes of <PREFIX>.<base64url(body)> exactly as transmitted.
 * Verifiers split on the LAST dot and never re-serialize JSON.
 */
import * as ed from "@noble/ed25519";
import * as b64 from "./base64url";

export type Prefix = "SA1" | "SS1" | "SR1";

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

const textEncoder = new TextEncoder();

export function splitToken(token: string, prefix: Prefix): SplitToken {
  const lastDot = token.lastIndexOf(".");
  const signingInput = lastDot < 0 ? "" : token.slice(0, lastDot);
  const firstDot = signingInput.indexOf(".");
  if (firstDot < 0) throw new MalformedToken(`not a 3-part ${prefix} token`);
  const bodyText = signingInput.slice(firstDot + 1);
  if (signingInput.slice(0, firstDot) !== prefix || bodyText.includes(".")) {
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
  return { signingInput: textEncoder.encode(signingInput), body, signature };
}

// ignoreBOM keeps a leading BOM in the text, where JSON.parse rejects it (docs/04: no BOM)
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Strict UTF-8, RFC 8259 JSON (no NaN/Infinity), an object with the body's JSON types. */
export function parseBody<T>(body: Uint8Array, parse: (value: unknown) => T): T {
  try {
    const value: unknown = JSON.parse(utf8.decode(body), (_key, v: unknown) => {
      // 1e999 parses to Infinity; the backend rejects numbers that overflow
      if (typeof v === "number" && !Number.isFinite(v)) throw new Error("number overflows");
      return v;
    });
    return parse(value);
  } catch {
    throw new MalformedToken("body is not a valid token body");
  }
}

export async function verifySignature(
  publicKey: Uint8Array,
  signature: Uint8Array,
  signingInput: Uint8Array,
): Promise<void> {
  let ok = false;
  try {
    // RFC 8032 verification, not the library's ZIP215 default (T-18)
    ok = await ed.verifyAsync(signature, signingInput, publicKey, { zip215: false });
  } catch {
    ok = false;
  }
  if (!ok) throw new BadSignature("signature does not verify");
}

/** Verify first, then decode the body. */
export async function verifyToken<T>(
  token: string,
  prefix: Prefix,
  publicKey: Uint8Array,
  parse: (value: unknown) => T,
): Promise<T> {
  const { signingInput, body, signature } = splitToken(token, prefix);
  await verifySignature(publicKey, signature, signingInput);
  return parseBody(body, parse);
}

/** Compact JSON, signed over the transmitted bytes. For the mock API and tests only. */
export async function signToken(prefix: Prefix, body: object, seed: Uint8Array): Promise<string> {
  const signingInput = `${prefix}.${b64.encode(textEncoder.encode(JSON.stringify(body)))}`;
  const signature = await ed.signAsync(textEncoder.encode(signingInput), seed);
  return `${signingInput}.${b64.encode(signature)}`;
}
