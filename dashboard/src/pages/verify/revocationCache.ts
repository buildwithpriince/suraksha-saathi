/**
 * The last root-signed SR1 list this browser saw, so /verify can check revocation offline.
 * Stored only after it verifies; a newer iat replaces an older one. Storage may be blocked.
 */
import { verifyRevocationList } from "../../lib/cert";

const KEY = "ss.revocations";

export interface CachedRevocations {
  token: string;
  iat: number;
}

export function readCachedRevocations(): CachedRevocations | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CachedRevocations>;
    return typeof value.token === "string" && typeof value.iat === "number" ? { token: value.token, iat: value.iat } : null;
  } catch {
    return null;
  }
}

/** Verify with the root key and keep it if it is newer. Returns the list now in use. */
export async function storeRevocations(token: string, rootPublicKey: Uint8Array): Promise<CachedRevocations | null> {
  const current = readCachedRevocations();
  const body = await verifyRevocationList(token, rootPublicKey);
  if (!body) return current;
  if (current && current.iat > body.iat) return current;
  const next = { token, iat: body.iat };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the list still applies to this check
  }
  return next;
}
