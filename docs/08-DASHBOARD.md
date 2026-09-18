# 08 — Admin Dashboard (React) and Public Verify

Visual direction: clean, high-contrast, safety palette (navy #1F3864, blue #0070C0, safety orange #E0620B,
red #B01E1E for failures). Desktop-first for admin screens; `/verify` is mobile-first.

## Routes
| Route | Access | Content |
|---|---|---|
| `/login` | public | Supabase email/password login |
| `/` Overview | admin, supervisor | KPI cards: workers, certified %, attempts (7 days), recert due (30 days); Top 5 failed rules bar chart; latest 10 attempts |
| `/compliance` | admin, supervisor | Heatmap: rows = sites, columns = scenarios, cell = pass rate (0–100% red→green), attempts count in cell; click cell -> filtered attempts |
| `/workers` | admin, supervisor | Table: name, site, certificate status chip, last attempt; search + site filter |
| `/workers/:id` | admin, supervisor | Profile, attempts timeline, certificates with QR preview |
| `/attempts` | admin, supervisor | Table: worker, scenario, variant, mode (AR/Tabletop), score, pass, flagged; filters |
| `/attempts/:id` | admin, supervisor | Rule breakdown table (earned/max, critical badge), event timeline, flag reason |
| `/certificates` | admin, supervisor | Status filter (valid/expiring/expired/revoked); Revoke button -> reason modal -> confirm |
| `/recertification` | admin, supervisor | Workers whose certificates expire in N days (default 30), sortable by days left, CSV export |
| `/devices` | admin | Pending/approved devices; Approve button |
| `/verify` | public | Camera scan or paste token -> big status card; runs offline crypto check in browser first, then calls `/v1/public/verify` if online for live revocation status |

## States (every data view)
- Loading: skeleton rows. Empty: one-line explanation + next action. Error: message + retry.

## Demo data
`backend/app/tools/seed_demo.py` creates 3 sites (`DHN-01` coal, `JSR-02` steel, `KDM-03` mica),
40 workers, ~150 attempts with realistic failures (GAS_01 R_BUDDY_CHECK is the most-failed rule),
12 certificates expiring within 30 days, 1 revoked certificate, 1 pending device.
Also 2 flagged attempts (a client claimed a pass the server rejected). All tokens are really signed with
the configured root key, so `/verify` works on demo certificates. Run on an empty migrated DB (it refuses
to run twice). `--admin <supabase uid>` / `--supervisor <uid>:<site>` add dashboard users.
