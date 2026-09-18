# 04 — Certificates, Attestations and Verification

## Token format (all three token kinds)
```
<PREFIX>.<base64url(bodyJsonUtf8)>.<base64url(ed25519Signature)>
```
- base64url without padding (RFC 4648 §5).
- The signature is over the ASCII bytes of `<PREFIX>.<base64url(body)>` exactly as transmitted.
- Verifiers split on the LAST `.`, verify, then decode the body. **Never re-serialize JSON to verify.**
- Signers serialize body JSON compactly (no spaces). Key order does not matter for verification.

| Prefix | Kind | Signed by | Carried in |
|---|---|---|---|
| `SA1` | Device attestation | Root key (backend) | Device storage; embedded in certificates |
| `SS1` | Certificate | Device key | QR code shown to worker / printed |
| `SR1` | Revocation list | Root key (backend) | Synced to devices; cached |

## Bodies
Attestation (`SA1`):
```json
{"did":"<device uuid>","dpk":"<base64url 32-byte device public key>","site":"DHN-01","iat":1788000000,"exp":1819536000}
```
Certificate (`SS1`):
```json
{"cid":"<uuid>","wid":"<worker uuid>","wn":"Ravi Munda","site":"DHN-01",
 "mods":[{"id":"FIRE_01","v":1,"s":86},{"id":"GAS_01","v":1,"s":91}],
 "iat":1789000000,"exp":1820536000,"lang":"hi","att":"<full SA1 token>"}
```
- `wn` max 24 characters (keeps QR small). `mods[].s` = scorePercent of the passing attempt.
- `exp = iat + min(validityDays of included scenarios) × 86400`.
Revocation list (`SR1`):
```json
{"iat":1789500000,"cids":["<uuid>", "..."]}
```

## Issuance (on device, offline)
1. Worker has a passing attempt for every required module (prototype: `FIRE_01` and `GAS_01`).
2. Device has a non-expired attestation. If not, show "Device not approved yet" and keep the
   result pending; issue automatically after the next successful sync.
3. Build body, sign with device private key, store in `certificates`, add outbox row, show QR.
4. QR: byte mode, error correction M, rendered at ≥ 60% of screen width with a quiet zone.

## Verification algorithm (app Verify screen, dashboard /verify, backend public endpoint)
Input: token string, trusted root public key, cached revocation list (optional), `now`.
1. Prefix must be `SS1` and have 3 parts -> else `INVALID_FORMAT`.
2. Decode body; parse `att`. Verify `att` signature with root public key -> else `INVALID_ATTESTATION`.
3. Attestation must cover issuance: `att.iat ≤ cert.iat ≤ att.exp` -> else `INVALID_ATTESTATION`.
4. `att.site == cert.site` -> else `INVALID_ATTESTATION`.
5. Verify certificate signature with `att.dpk` -> else `INVALID_SIGNATURE`.
6. `cert.iat ≤ now + 300` (5 min clock skew) -> else `INVALID_FORMAT`.
7. If revocation list present and verified with root key, and `cid` in it -> `REVOKED`.
8. If `now > cert.exp` -> `EXPIRED`.
9. Otherwise `VALID`.
UI mapping: VALID -> green "Valid"; EXPIRED -> amber "Expired"; REVOKED -> red "Revoked";
anything else -> red "Invalid". Always show "Revocation list updated <relative time>" or
"Revocation status unknown (offline, no list)".

## Keys
- Root key: generated once with `backend/app/tools/gen_root_key.py`; private key only in backend
  env `ROOT_SIGNING_KEY_B64`. Public key committed at `content/trust/root_public_key.txt` and
  compiled into app and dashboard.
- Device key: generated on first launch, stored in app-private storage (prototype limitation;
  production: hardware-backed keystore). Never leaves the device.

## Test vectors (TEST KEYS ONLY — never use in a real build)
Seeds are raw 32-byte Ed25519 private key seeds.
- Root seed (hex): `0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20`
- Root public key: `ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ`
- Device seed (hex): `2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40`
- Device public key: `5_FioQvsVZr-oZXk3OhLaVaNXSywlj60RsBoXisX8vA`

Every implementation (C# Core, Python backend, TS dashboard) must pass all four:
| # | Input | now | Expected |
|---|---|---|---|
| V1 | `cert` | 1789100000 | `VALID` |
| V2 | `cert` | 1830000000 | `EXPIRED` |
| V3 | `tampered` (score changed, original signature) | 1789100000 | `INVALID_SIGNATURE` |
| V4 | `cert` with revocation list `rev` | 1789600000 | `REVOKED` |

The exact token strings are in `content/trust/test-vectors.json` (keys: `att`, `cert`, `tampered`, `rev`).
The valid certificate token is 807 characters, which fits comfortably in a QR at level M.
