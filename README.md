# PlayERP portal — DEV

Independent owner (`/`) and platform staff (`/admin`) portal. Official target:
https://playerp.dev.bmore.app · Supabase **PlayERP-dev** (`fzwzmwstxlsxdzdmphyq`).

React + TypeScript + Vite; English/Spanish product UI for desktop/tablet. Owner venue selection, read-only tenant directory and Print Server detail, Supabase login/logout/session renewal/recovery/password change. Platform membership is separate from venue roles. Platform super admins can also invite and manage platform staff. There are no billing, venue editing, or printer-operation controls.

## DEV dependency status

Tom applied and verified the safe-read RPC migration, Auth redirect allow-list and controlled DEV test profiles/mailbox (work fc53fb6b-c124-4a58-bc6d-4b77b40db607). The resumed portal passes real DEV API/browser profile checks and real renewal, single-session revocation and recovery/password-return checks. Sanitized results and captures: [live evidence](docs/evidence/live/README.md). See [DEV contract](docs/DEV-CONTRACT.md). Do not treat the synthetic browser tests as proof of live RLS or recovery email delivery. No production deployment or infrastructure provisioning is included.

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

## Opt-in live DEV acceptance

`tests/live-dev.mjs` checks the seven test profiles and anonymous access through real RPCs and the browser, including desktop/tablet screenshots. `tests/live-auth.mjs` checks real refresh and revocation of one test session while preserving another. Both require `PORTAL_DEV_FIXTURES` pointing to the private credential directory supplied by Tom; they never print or save credentials. Set `LIVE_OUTPUT_DIR` for sanitized results and keep that directory out of git.

Both default to the official DEV origin. `RUN_DEV_RECOVERY=1 node tests/live-auth.mjs` additionally sends one real recovery email, consumes its pending token via Tom's controlled mailbox, changes the test password, checks return/expired link, and restores the original fixture password. Run that mode deliberately: DEV has a shared email rate limit. The mailbox provides the pending email token, not the email HTML. Never run these against production.

## Reused resources

Approved plan PE-320.1; Tom's review PE-320.2. PE-307 inventory is in work `2320182c-7ea2-41a9-b358-c7c381b7e691`; CD-90 target registration in `59da58a0-3500-41ce-b836-ddbe10919ca3`. The portal does not alter Lovable code, routes, Auth site_url, memberships or session settings.

## PE-322 unified access and staff acceptance

The login chooses the authorized scope before rendering its shell. Mixed users start in
administration and switch scope explicitly from the account menu. `/admin/staff` connects
to the existing DEV platform-staff backend. See the PE-322 section of
[DEV contract](docs/DEV-CONTRACT.md) for role separation, invitations and session behavior.

`tests/pe322-live.mjs` creates tagged temporary DEV identities, exercises login/routing,
mixed scope switching, support and revoked/venue-role denial, staff actions and real Auth
invitation/recovery tokens, and removes its users and audit rows in `finally`. It requires
`SUPABASE_ACCESS_TOKEN` in the process environment and `PORTAL_DEV_FIXTURES` for the existing
DEV venue-superadmin test identity. It accepts only the local test origin or official DEV.
Use `PE322_OUTPUT` for sanitized evidence, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for a browser.
It sends email only to Resend test sinks. Never print the environment or record token URLs.
No personal account is modified by the test.
