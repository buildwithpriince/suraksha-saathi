# dashboard — React admin compliance dashboard + public verify page

Loaded when working inside `dashboard/`. Root `CLAUDE.md` rules still apply.

## Stack
- React 18 + Vite + TypeScript (strict), React Router
- TanStack Query for server state; no global store unless a spec needs one
- Tailwind CSS; Recharts for charts
- Supabase JS client for auth only (all data goes through the FastAPI backend)
- QR: `@zxing/browser` for camera scan; `@noble/ed25519` for offline signature checks
- Tests: Vitest + React Testing Library. Deploy: Vercel

## Layout
```
src/
  api/          # typed fetchers; types mirror docs/06-API.md
  auth/         # Supabase session, ProtectedRoute
  pages/        # one folder per screen in docs/08-DASHBOARD.md
  components/   # shared UI
  lib/cert/     # QR token decode + verify (must pass docs/04 test vectors)
```

## Rules
- Screens, columns, filters and empty states follow `docs/08-DASHBOARD.md`.
- API types are hand-written to mirror `docs/06-API.md`; update both together.
- `lib/cert` must pass the shared test vectors in `docs/04-CERTIFICATES.md`.
- The `/verify` route is public, mobile-first, and works for a scanned token with no login.
- Every data view has loading, empty and error states.

## Commands
- `npm install`, `npm run dev`, `npm run typecheck`, `npm run test`, `npm run build`
