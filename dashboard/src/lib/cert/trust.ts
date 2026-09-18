/**
 * The trusted root public key, compiled in from content/trust/root_public_key.txt (docs/04 "Keys").
 * null while the committed file still holds the placeholder (T-17 not done yet).
 */
import rootKeyFile from "../../../../content/trust/root_public_key.txt?raw";
import { publicKeyFromB64url } from "./keys";

export function parseRootKeyFile(text: string): Uint8Array | null {
  try {
    return publicKeyFromB64url(text.trim());
  } catch {
    return null;
  }
}

export const COMMITTED_ROOT_PUBLIC_KEY: Uint8Array | null = parseRootKeyFile(rootKeyFile);
