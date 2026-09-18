---
paths:
  - "mobile/src/core/certificates/**"
  - "backend/app/crypto/**"
  - "dashboard/src/lib/cert/**"
---

# Rules for certificate and signature code

- Spec: `docs/04-CERTIFICATES.md`. Test vectors: `content/trust/test-vectors.json`. All four cases must pass in every language.
- Sign and verify over the exact transmitted `PREFIX.base64url(body)` bytes. Never re-serialize JSON before verifying.
- base64url without padding; decoders must accept missing padding and reject invalid characters.
- Split tokens on the LAST dot for the signature; the certificate body contains a nested token.
- Compare statuses by enum, not strings built at runtime. Use constant-time comparison where comparing secrets.
- Test seeds from the vectors file must never appear outside tests.
- After changes, ask the `crypto-reviewer` subagent to review the diff.
