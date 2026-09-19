import rootKeyFile from '@content/trust/root_public_key.txt';
import vectors from '@content/trust/test-vectors.json';

import { resolveTrust, type Trust } from '@/core/certificates/trust';

/**
 * The root this build trusts, decided from the committed root_public_key.txt when the bundle is
 * built. There is no runtime switch. The docs/04 TEST root is used only while that file holds the
 * placeholder, and then every certificate screen shows the Demo keys banner (D-030).
 */
export const TRUST: Trust = resolveTrust(rootKeyFile, {
  rootSeedHex: vectors.root_seed_hex,
  rootPublicKey: vectors.root_public_key,
});

export const DEMO_KEYS = TRUST.mode === 'demo';
