# Portal production build

The default `npm run build` and development server preserve the existing DEV configuration.
For the independent production artifact use `npm ci` then `npm run build -- --mode prod`,
with `SUPABASE_URL=https://uzzchmvinutuoygtziie.supabase.co` and `SUPABASE_PUBLIC_KEY`
in the build environment (or an ignored `.env.prod.local`). Never supply a privileged key.
`PORTAL_ENV=prod` also selects production explicitly; prod mode cannot select DEV.

The build fails without the exact project URL and a public key. Legacy JWT keys must be
unexpired, anon and carry the production project ref. Both legacy and opaque publishable
keys must pass a read-only request to the production Auth gateway. Network failure stops
the build. Key values must not be included in build logs or delivery evidence. Legacy anon
is supported for compatibility with existing Edge Functions that verify JWTs.

Only the selected configuration is injected into the browser. Production session storage
and auxiliary auth state use the `playerp.portal.prod.` namespace. DEV keeps its old names.
An artifact configured for DEV fails closed if accidentally served on `portal.playerp.net`.

Publication belongs to Tom's PROD lane after registration of the portal's exact target and
scopes, dependency confirmation, saved rollback state and the existing Beny signature.
This branch does not publish DEV or change the POS. Infrastructure belongs in
`COREdev/infra/vps3-prod/sites`, not this repository. The dedicated portal host needs an exact
Host rule with priority above the POS wildcard and nginx `try_files $uri $uri/ /index.html;`.
Verify that router before creating DNS. Use the existing wildcard certificate if valid.

Append only these portal return URLs to PROD Auth allowlist, preserving all existing entries
and Site URL: `/auth/complete`, `/auth/password`, `/auth/invitation`, `/oauth/consent`, on
`https://portal.playerp.net`. Coordinate `MCP_CONSENT_URL=https://portal.playerp.net/oauth/consent`
with Tom. No backend changes, real consent decisions or MCP connections are part of this build.
