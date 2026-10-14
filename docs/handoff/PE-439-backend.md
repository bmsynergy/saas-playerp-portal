# PE-439.3 — backend prerequisite for DEV publication

Resolved by Tom in PE-439.4: backend `97e1d293e9d00349afbb98171752941f8c7c7a47`, migration `20261014020000` applied and registered only in DEV; 23/23 synthetic persistence checks PASS. Frontend publication is now authorized by the completed prerequisite. See [updated verification](../PE-439-verification.md).

Historical handoff request (completed): minimal normalization fix of `ps_admin_legacy_credentials_reconcile` in Supabase DEV `fzwzmwstxlsxdzdmphyq`, versioned in `bmsynergy/saas-playerp-backend` before frontend publication. No firmware, devices or production changes.

The MCP read of the live function was denied in this run: `MCP tool call requires approval, but approval policy is never`. No alternative access was attempted. A handoff is required to execute this backend-owned step; this document is a proposed change, not evidence of deployment.

Source inspected: backend main `698b115238de220d7325d6a42630a5ec55b15744`, `_migrations/20261013170000_pe428_ps_legacy_reconcile_code_exact.sql`. Its predicate strips every hyphen before identifying a current code; this would transform an exact legacy value such as synthetic `AB-CDE23456` into a different secret.

`pe439-normalization.sql` is the complete proposed replacement from that source, with only comments and the recognition predicate changed. Confirm the live definition has no intervening changes, put the migration in backend `_migrations/` with PE-439 attribution, commit/push, apply only in DEV, and confirm registration and definition. Preserve signature, grants, staff/identity/CA/physical-check checks, audit, Wi-Fi logic and stored historical values. No UPDATE of existing values or actual reconciliation is needed for this change.

Recognition is case insensitive for exactly these three shapes using `ABCDEFGHJKMNPQRSTUVWXYZ23456789`:

- 10 contiguous characters.
- 5 characters, hyphen, 5 characters.
- Historical 4 characters, hyphen, 4 characters, hyphen, 2 characters.

Only recognized shapes uppercase and remove grouping hyphens. All other valid 4–64 printable ASCII characters without spaces remain exact. Fixtures for the backend check: canonical `ABCDE23456`, `abcde-23456`, `ABCD-E234-56` yield the canonical value; `LeGa-cY-9!` and `AB-CDE23456` remain exact. Reject whitespace, controls, non-ASCII, fewer than 4 or more than 64 characters. Avoid printing real values or invoking any device action.

Return backend commit SHA, DEV migration registration and fixture results. Uma must then rebase/check the frontend branch if needed and run `coredeva-publish playerp.dev <frontend-sha>`. The publisher must validate the exact target key. Do not publish the frontend before that backend confirmation.
