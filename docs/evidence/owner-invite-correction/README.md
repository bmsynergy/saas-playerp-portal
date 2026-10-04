# Owner invitation correction — work 541415a4-cfff-4bb8-bd42-7709e2924c9a

The password form unconditionally called the SaaS-only `accept_platform_invitation`
RPC. A venue owner with no platform roster entry received `P0002` after Auth had
already saved the password, leaving the invitation flow unfinished.

`savePassword` now preserves real SaaS invitation acceptance, including users who
also own venues. On the two explicit no-platform-invitation outcomes, it checks
fresh server venue access and completes only if that access exists. Unexpected
errors propagate. `same_password` permits invitation completion retries after an
already successful password save; ordinary password resets retain existing behavior.
No membership, portal_access, backend, or production changes were made.

The own-owner row remains non-editable; its EN/ES copy explicitly says another
owner must remove it or change its role. Existing backend self-change protection
is present in backend main f06d5940ee8a45e5f7bddf77d266ca5eaad6eab2;
this session has not re-tested that protection on the live server.

Validation: 80 unit tests and production build passed. Browser tests use the real
Supabase client with intercepted Auth/RPC responses; they are NOT live email or
backend-permission evidence. Seven authentication scenarios include callback/password,
reload with same_password, transient access failure/retry, SaaS staff, dual access,
no invitation, and password recovery. Existing owner-management browser checks cover explicit
confirmation/cancellation, self read-only, last-owner errors, EN/ES and 1440/390px.

Gaby reviewed read-only in the same session within 15 minutes. Her finding about
accounts with both a venue and a pending platform invitation was corrected and
rechecked; she found no further verifiable implementation defect. She explicitly
left live DEV invitation verification pending.

Live verification is blocked: no supplied private DEV fixture credentials are
available in this run, and Supabase MCP execute_sql was denied by the permission
policy. It must be completed with controlled DEV accounts and a valid invitation
link, without using production or real-user passwords. In particular, do not
substitute a promoted existing member for a freshly invited owner in that test.

The legacy tests/browser-smoke.mjs run passed four anonymous/admin cases then
stopped at its stale owner heading (line 60: "Your spaces, in one place.").
That OwnerPage/ownerWelcome mismatch already exists in the base branch. This is
not reported as a full smoke pass; password recovery is covered in the focused
seven-scenario browser regression instead.
