# PE-404.2 — OAuth consent in the DEV administration portal

Baseline: `b77d378e67afd8cdf7e46562b2b529aa557f7cb8`. The published DEV JavaScript `index-CvGnvssf.js` matched the clean baseline build byte for byte (SHA-256 `8525fd3a63b086381844f3f5059774ae106fbf5c1bd8334efe08e2944a4dc89d`). No production or backend changes.

Reuses normal portal authentication and `mcp_consent_context` / `mcp_consent_decide`. Changes: reject duplicate request IDs, normalize login return, preserve OAuth return for mixed staff/owner accounts, bind loaded state to request/account, require a fresh radio choice and named confirmation of exactly one venue, translate pilot failures, invalidate rejected sessions, and validate the callback against the RPC destination.

Validation on 2026-10-11:

- `npm test`: 85/85 passing (9 files). `npm run build`: passing; existing large-bundle warning remains.
- `node tests/oauth-consent.mjs`: 15 browser checks passing, including 390/1440 px and EN/ES. All Auth/RPC traffic is intercepted with invented credentials and data; this is not certification of a real OAuth approval. See `browser-results.json`.
- Real anonymous DEV requests to both consent RPCs: HTTP 401, permission denied. See `anonymous-rpc.json`. No account was used and no request was approved.
- Existing `node tests/browser-smoke.mjs`: first four groups pass, then times out waiting for the obsolete owner heading `Your spaces, in one place.` at line 60. Reproduced the identical failure on untouched baseline `b77d378` on port 18798. This broad smoke is not reported as passing; the OAuth checks and unit regression suite do pass.
- Gaby reviewed read-only in the same session. Two findings (callback authority normalization and session rejection returning to login) corrected and rechecked with no remaining findings.

Reproduce browser checks with a local Vite server on port 18799. `PORTAL_TEST_ORIGIN` can select the published DEV origin while retaining mocked backend requests; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed browser and `CONSENT_OUTPUT` controls the result directory. Real approval remains pending Beny's decision; no Beny credentials or changes to the pilot are involved in these tests.
