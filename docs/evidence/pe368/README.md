# PE-368 — Venue > Users: owner management (DEV only)

Backend contract: `bmsynergy/saas-playerp-backend` main, `f06d5940ee8a45e5f7bddf77d266ca5eaad6eab2`, `docs/portal/owners-del-venue.md`. The portal uses the existing DEV session and `owner-venue-users`; no database/admin credential is added.

Owners can invite another Owner with an explicit second confirmation, appoint an existing eligible member, demote another Owner or remove their venue membership. Capabilities come from `invite_roles` / `owner_actions`; ordinary role/access locks keep their previous meaning. Every owner change sends literal `confirm: true`. Owner access is displayed as active even when `portal_access` is false. Safeguard errors and partial email failures have English/Spanish messages.

Validation before publication:
- `npm test`: 71 tests passed.
- `npm run build`: passed.
- `node tests/owner-management-states.mjs`: passed six browser scenarios covering 390/1440px, confirmation/cancel, exact payloads, owner-only access, protected rows, last-owner and other refusal messages in EN/ES, and partial notification failure. **Synthetic responses**, not live backend authorization evidence. See `browser-contract.json` and screenshots.
- Gaby independent read-only review in the same session: no verifiable defects found. Live entry/mutual management and publication remain separate checks.

The real DEV harness `tests/owner-management-live.mjs` uses only PE321 accounts and WI170P1 Venue. It sends one invite to a new Resend sink, removes that pending invite, appoints the frontdesk fixture without changing `portal_access`, signs it into the hosted portal, lets both owners manage the other, and restores original roles/memberships. Credentials come from a private path; no tokens/passwords are written to evidence. Its report will be added after hosted validation.

## Hosted verification, 4 October 2026

Implementation commit `1be9f7c5c395ada8841147ad25570fca432dbbd8` was pushed to `uma/pe368-owner-management` and published to `playerp.dev` by the connector. Public `/` and `/admin` returned HTTP 200; no rollback. No PROD target, setting, account or data was changed.

`hosted-live.json` contains the real DEV results (no intercepted APIs):
- Invitation created as Owner with explicit confirmation, email sent, 2 owner notices sent / 0 failed; pending invitation removed through the UI.
- Existing frontdesk fixture appointed Owner, then signed in via the hosted mobile login and opened Users. Its own RLS-protected membership read returned `role: owner, portal_access: false`.
- That new Owner demoted/restored the original Owner; the original Owner demoted the new Owner. All confirmed operations returned 200. No `set_portal_access` call was made.
- The demoted fixture again had no portal venues. Original roles, memberships and access values match the before snapshot. Newly created pending test accounts were withdrawn from the venue (their inactive test profiles remain, like the backend test fixtures).

The harness was corrected during validation: list access is *effective* access, so the raw flag is read with the member's own session; and a successful login to a Users deep link correctly opens Users, not Dashboard. Invitation checks had already passed; only the remaining ownership checks were rerun, avoiding redundant invitation emails. `OWNER_TEST_SKIP_INVITE=1` supports that repeat. Cleanup retries only `busy_retry` up to three times, following Gaby's minor test-harness observation.

`hosted-contract.json` repeats the six browser contract scenarios against the **published JS**, with synthetic backend responses explicitly marked. In particular, `last-owner-es.png` proves the UI message for a 409 `last_owner`; it does not claim a destructive last-owner attempt against live accounts. The real last-owner guard and accepting a brand-new invited account were verified in Tom's backend evidence at `f06d5940`; this frontend work additionally verifies real role-based login and mutual management.
