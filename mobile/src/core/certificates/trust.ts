/**
 * Which root key this build trusts (docs/04 "Keys", D-030).
 *
 * - `real`: content/trust/root_public_key.txt holds a key. Only that root is trusted and the demo
 *   path cannot be reached: no demo seed is returned, so nothing can sign a demo attestation.
 * - `demo`: the file still holds the committed placeholder (T-17 not done). The docs/04 TEST root
 *   is trusted and its seed signs this device's attestation, so issuance and verification can be
 *   shown offline. Screens that show or check certificates must show the "Demo keys" banner.
 * - `unconfigured`: anything else (a garbled file, or the TEST key committed as if it were real).
 *   Nothing verifies and nothing is issued: fail closed.
 */
import { InvalidKey, hexToBytes, publicKeyFromB64url, publicKeyOf } from './keys';

export const ROOT_KEY_PLACEHOLDER = 'REPLACE_WITH_REAL_ROOT_PUBLIC_KEY';

export type Trust =
  | { mode: 'real'; rootPublicKey: Uint8Array }
  | { mode: 'demo'; rootPublicKey: Uint8Array; demoRootSeed: Uint8Array }
  | { mode: 'unconfigured' };

export interface DemoKeys {
  /** docs/04 TEST root seed (hex). Test keys only; see D-030. */
  rootSeedHex: string;
  /** docs/04 TEST root public key (base64url). */
  rootPublicKey: string;
}

/** The key in root_public_key.txt (one base64url line, whitespace trimmed), or null. */
export function parseRootKeyFile(text: string): Uint8Array | null {
  try {
    return publicKeyFromB64url(text.trim());
  } catch (e) {
    if (e instanceof InvalidKey) return null;
    throw e;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function resolveTrust(rootKeyFile: string, demo: DemoKeys): Trust {
  const testRoot = publicKeyFromB64url(demo.rootPublicKey);
  const committed = parseRootKeyFile(rootKeyFile);
  if (committed !== null) {
    // The TEST key committed as the real root would make test-signed certificates "real"
    return sameBytes(committed, testRoot) ? { mode: 'unconfigured' } : { mode: 'real', rootPublicKey: committed };
  }
  if (!rootKeyFile.trim().startsWith(ROOT_KEY_PLACEHOLDER)) return { mode: 'unconfigured' };
  const seed = hexToBytes(demo.rootSeedHex);
  if (seed.length !== 32 || !sameBytes(publicKeyOf(seed), testRoot)) return { mode: 'unconfigured' };
  return { mode: 'demo', rootPublicKey: testRoot, demoRootSeed: seed };
}
