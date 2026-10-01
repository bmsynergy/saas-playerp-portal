# Real PlayERP-dev acceptance

Captured against https://playerp.dev.bmore.app on 2026-10-01. These are real DEV responses and browser sessions, without API mocks. The separate `../browser-smoke.json` and older screenshots remain explicitly synthetic.

- `profile-matrix.json`: anonymous + seven test profiles; owner isolation and platform-only directory/detail; real UI login, reload, selection and logout; exact response field allowlists.
- `detail-real-1440-en.png`, `detail-real-834-es.png`: actual linked Print Servers, version 0.3.3/online and revoked with missing version/heartbeat. For publication, account email, contact details and server identifiers are masked at capture time; data responses and product rendering are unchanged.
- `auth-flows.json`: real refresh (200), revocation of one test session (400, separate session still 200), real recovery requested at 12:44:26 UTC (200), link redirect (303), password update (200), new-password login (200), return to owner, used-link denial EN/ES, and original fixture password restored. The actual email token comes through Tom's restricted DEV mailbox; the email HTML is not available. Initial 429 was resolved by waiting, without changing the shared rate limit.
- `password-updated.png`, `expired-real-link-es.png`: real recovery UI and used-link error; no token or password in the captures.
- `tablet-controls.json`: real 834 px drawer/menu/password validation/logout checks.
- `hosted-fixture-smoke.json`: explicitly **synthetic** 13-check integration regression on the published bundle, including rare pending, loading/error states and interrupted logout. This is not evidence of live permissions or emails.
- The Print Server heartbeat threshold is less than three minutes, aligned with the venue panel as confirmed by Tom. Pending is supported and tested with an explicitly synthetic fixture because DEV has no pending rows at validation time.

Backend contract/redirects verified by Tom: work fc53fb6b-c124-4a58-bc6d-4b77b40db607, artifact 490ffcc6-7695-4820-9aa5-fcf17201b84c. No production, Lovable, infrastructure, business data or real memberships were changed.

This folder contains no credentials, bearer tokens, recovery links or raw Auth responses. Opt-in runners are in `tests/live-dev.mjs` and `tests/live-auth.mjs`; fixture credentials must be supplied outside the repository.
