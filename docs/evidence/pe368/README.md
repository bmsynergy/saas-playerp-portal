# PE-368 — Venue > Users: owner management (DEV only)

Backend contract: `bmsynergy/saas-playerp-backend` main, `f06d5940ee8a45e5f7bddf77d266ca5eaad6eab2`, `docs/portal/owners-del-venue.md`. The portal uses the existing DEV session and `owner-venue-users`; no database/admin credential is added.

Owners can invite another Owner with an explicit second confirmation, appoint an existing eligible member, demote another Owner or remove their venue membership. Capabilities come from `invite_roles` / `owner_actions`; ordinary role/access locks keep their previous meaning. Every owner change sends literal `confirm: true`. Owner access is displayed as active even when `portal_access` is false. Safeguard errors and partial email failures have English/Spanish messages.

Validation before publication:
- `npm test`: 71 tests passed.
- `npm run build`: passed.
- `node tests/owner-management-states.mjs`: passed six browser scenarios covering 390/1440px, confirmation/cancel, exact payloads, owner-only access, protected rows, last-owner and other refusal messages in EN/ES, and partial notification failure. **Synthetic responses**, not live backend authorization evidence. See `browser-contract.json` and screenshots.
- Gaby independent read-only review in the same session: no verifiable defects found. Live entry/mutual management and publication remain separate checks.

The real DEV harness `tests/owner-management-live.mjs` uses only PE321 accounts and WI170P1 Venue. It sends one invite to a new Resend sink, removes that pending invite, appoints the frontdesk fixture without changing `portal_access`, signs it into the hosted portal, lets both owners manage the other, and restores original roles/memberships. Credentials come from a private path; no tokens/passwords are written to evidence. Its report will be added after hosted validation.
