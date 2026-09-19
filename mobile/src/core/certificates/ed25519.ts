/**
 * @noble/ed25519 configured for Hermes: it has no WebCrypto, so noble's async API (which uses
 * crypto.subtle) can't run. Set the sync SHA-512 once here and use only the sync functions.
 * Import `ed` from this module, never from '@noble/ed25519' directly.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

export { ed };
