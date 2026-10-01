# PlayERP portal — DEV

Independent owner (`/`) and platform staff (`/admin`) portal. Official target:
https://playerp.dev.bmore.app · Supabase **PlayERP-dev** (`fzwzmwstxlsxdzdmphyq`).

React + TypeScript + Vite; English/Spanish product UI for desktop/tablet. Owner venue selection, read-only tenant directory and Print Server detail, Supabase login/logout/session renewal/recovery/password change. Platform membership is separate from venue roles. There are no billing, support, onboarding, editing, or printer-operation controls.

## DEV dependency status

The frontend is implemented; live acceptance is pending Tom's application and verification of the safe-read RPC migration, Auth redirect allow-list and controlled test profiles/mailbox. See [DEV contract](docs/DEV-CONTRACT.md). Do not treat the synthetic browser tests as proof of live RLS or recovery email delivery. No production deployment or infrastructure provisioning is included.

## Build

```sh
npm ci
npm run build
npm test
```

`dist/` is the publication artifact. Public browser configuration is pinned to DEV in `src/lib/config.ts`; no environment override or service-role key is accepted. COREdevA builds a clean committed copy and publishes via `coredeva-publish playerp.dev <SHA>`; no manual service commands are needed.

## Focused browser checks

Start `npm run dev -- --port 18799`, then in another terminal run `node tests/browser-smoke.mjs` (install the matching Chromium via Playwright if absent). `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an existing Chromium binary, `PORTAL_TEST_ORIGIN` selects the local origin, and `SMOKE_OUTPUT_DIR` changes the default `test-results/smoke` output. Stop the test server when finished.

These checks intercept the DEV Auth/RPC requests with explicit synthetic fixtures. They cover rendering at 1440/834 px, language persistence, direct routes, owner selection, UI denial, session storage cleanup and renewal, recovery callback/password return, and loading/error/empty presentation. They are a narrow integration check, not the deferred complete end-to-end suite.

## Reused resources

Approved plan PE-320.1; Tom's review PE-320.2. PE-307 inventory is in work `2320182c-7ea2-41a9-b358-c7c381b7e691`; CD-90 target registration in `59da58a0-3500-41ce-b836-ddbe10919ca3`. The portal does not alter Lovable code, routes, Auth site_url, memberships or session settings.
