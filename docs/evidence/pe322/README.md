# PE-322.2 verification

**BLOCKED — not published.** The final independent review identified and the real DEV
probe confirmed that an inactive legacy platform membership with both invitation timestamps
NULL can call `accept_platform_invitation()` and become an active super admin, with staff
management access. See `legacy-invitation-probe.json` and the runnable
`tests/pe322-legacy-invitation-probe.mjs`. This additional case is outside the previously
passing 28-scenario matrix; those positive checks do not imply full acceptance.

The user explicitly instructed this step not to expand the approved plan when it cannot be
completed as specified. The frontend is saved for review; no publication was requested and
no backend function/policy/schema was changed. The temporary reproducer identity and its
audit rows were removed. The official portal still serves the original version.

Frontend consumes the already versioned DEV backend (a2f213b); no backend or Lovable changes.

Before publication:
- `npm run build`: TypeScript and Vite passed.
- `npm test`: 12/12 (access destinations, safe next links, display-name fallback,
  Print Server status boundary, safe errors, EN/ES key parity).
- `node tests/browser-smoke.mjs`: 13/13 synthetic browser cases; zero page errors.
- `node tests/pe322-live.mjs`: real DEV API + local browser UI, 28 checks. No API mocks.
- `node tests/live-auth.mjs`: real token renewal and local-session revocation; an independent
  session of the same account remains valid.

`local-live.json`, `local-session.json` and `browser-smoke.json` record those checks.
The live harness removes all its temporary accounts and audit rows and verifies the roster
count returns to its original value (4). Existing personal memberships are never changed.

For local verification, Auth emitted real invitation/recovery tokens with the official DEV
redirect. The harness verifies the 303 response and maps only the origin to the local test
server before opening the resulting browser session. Hosted verification of this new frontend was not run because publication is blocked.

No inbox UI was inspected. Email evidence is the actual successful DEV function response
(including provider acceptance, PlayERP sender and locale) and the resulting single-use Auth
token, successful password change and re-login. No token/password is stored in evidence.

The canonical assets come from `bmsynergy/playerp` at
`73655c61f101dbe75429c1fa586f8280782915d9`. Both source and served bytes are compared by SHA-256.
