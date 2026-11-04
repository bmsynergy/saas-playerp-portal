# PE-577.2 · Portal subdomain UI, DEV only

Backend contract: `bmsynergy/saas-playerp-backend` main
`a86c35a535a7ad511afb630cee99bb04e4bf3e96`, `_docs/pe5771_subdominio_plataforma_contrato.md`.
The portal calls that existing contract; this change contains no backend or PROD writes.
The live RPC requires `p_expected_current` for preview as well as confirmation.

- `live-local.json`: browser flow against real DEV Auth, RPCs and onboarding edge,
  served from the local frontend. Created the identified inactive fixture, changed
  its label independently of its slug, previewed before saving, confirmed once,
  reloaded the saved value, checked alias retention and unchanged venue state.
- Screenshots show the review, confirmation and mobile EN detail.
- `states.json`: synthetic browser faults with real DEV authentication/read data;
  intercepted mutation responses do not write. These are UI error-state checks,
  not a backend concurrency or PROD integration test.

The field and panel reuse the portal controls and CSS height token. EN and ES
strings cover all new states. Addresses and bases come from the server, never
from the slug. A public address is linked only when all operational conditions
agree. DEV future addresses remain pending relocation; current app and portal
stay on Lovable and playerp.dev.bmore.app.

Validation: `npm test` (412 assertions), `npm run build`,
`node tests/pe577-live.mjs`, `node tests/pe577-states.mjs`.
Gaby reviewed read-only in this session: no remaining findings after correcting
the already-current message and an EN translation insertion syntax error.

Live fixtures use only the existing controlled staff test identity and Resend
sink addresses. Test reports never contain sessions or credentials. Reruns use
the journal to recover the same onboarding request rather than create duplicates.

## Published DEV acceptance

`live-published.json`: full browser flow at https://playerp.dev.bmore.app after
publishing a4c26998adf380e2275fad8860cdd2881d7494eb. Created inactive fixture
`08d3d13a-8816-41f6-8fdc-811f67de40dc` (`pe577-uma-mw1h4su2`). Dropped the first
completed create response and retried the same request: same venue, no duplicate.
Corrected its address from `pe577-uma-mw1h4su2-address` to
`pe577-uma-mw1h4su2-corrected`, with the former retained as an alias, unchanged slug,
external primary and inactive state; reload, EN/ES and 390/1440 px passed.
A final wording guard also avoids describing a verified alias as serving while
its environment is still pending relocation.
