# 00 — Product Requirements (prototype scope)

## Problem (from SIH 2026 PS 26041, Govt. of Jharkhand)
- Young, often tribal, recruits join coal mines, steel plants and mica units with no industrial exposure.
- Classroom training with static manuals: under 20% retention after one week.
- Live drills disrupt operations; VR headset simulators are out of reach for small mines and contract workers.
- DGMS recorded 48 fatal mine accidents in Jharkhand in 2022-23; many involved workers with under 30 days of orientation.
- Certification is legally required, but there is no regional-language digital platform, and paper certificates cannot prove comprehension.

## Users
| User | Where | Needs |
|---|---|---|
| Worker (new / contract) | Phone or shared site tablet, often offline, low literacy | Voice-led drills in Hindi or Santali; a certificate they can show |
| Supervisor | Site kiosk tablet + dashboard | Enrol workers, run sessions, see who is due for recertification |
| Inspector / employer | Phone at a site gate, maybe no network | Scan a QR and know in 3 seconds if the certificate is real and valid |
| Admin (state / ITI) | Dashboard | Compliance across sites, weak domains, revoke certificates, export |

## In scope for the prototype (maps to the judge checklist)
| # | Requirement | Acceptance criteria (verifiable) |
|---|---|---|
| R1 | Android APK | Installs and runs on an Android 10+ mid-range phone. Cold start to Home < 6 s. No headset |
| R2 | Two complete AR modules | `FIRE_01` and `GAS_01` playable start to finish on real surfaces via camera, per `docs/02` |
| R2a | Non-ARCore fallback | On a device without ARCore the same modules run in tabletop 3D mode with identical scoring |
| R3 | Assessment engine | Scores from recorded actions per `docs/03`; critical-step miss fails regardless of score; result screen explains each lost point |
| R4 | QR certificate generation | Passing all required modules issues a signed QR per `docs/04`, fully offline |
| R4a | QR verification | App Verify screen and dashboard `/verify` both return Valid / Expired / Revoked / Invalid, offline for signature checks |
| R5 | Hindi + Santali | Every UI string and every step narration available in `hi` and `sat`; switchable at runtime; Devanagari renders correctly |
| R6 | Offline | Full worker journey (enrol, train, assess, certify, verify) works in airplane mode; data syncs later without duplicates |
| R7 | Admin dashboard | Login, sites, workers, attempts, certificates, compliance heatmap, recertification-due list, revoke, CSV export |
| R8 | Submission assets | Public GitHub repo with README + setup; 3-minute demo video per `docs/09` |

## Differentiators we promised in the PPT (must be visible in the demo)
- D1 Action-based scoring with critical steps (not MCQs)
- D2 Certificates verifiable with no network (signature chain, cached revocations)
- D3 Printed exit markers anchor evacuation routes to real exits (image tracking)
- D4 Shared-tablet kiosk mode with worker ID card QR login
- D5 Recertification: certificates expire; dashboard lists who is due

## Out of scope (say "roadmap" if asked)
- Modules for the remaining PS domains (Machinery and the rest) — content only, no build
- Face recognition (prototype stores a selfie hash only), DigiLocker integration, iOS
- Production key storage in hardware keystore (documented as known limitation)

## Non-functional
- Target device class: 4 GB RAM, Snapdragon 6-series or equivalent, Android 10+
- AR scenes hold 30 fps on target device; APK < 150 MB
- All safety content reviewed by a human before demo; unreviewed items carry `needsReview`
