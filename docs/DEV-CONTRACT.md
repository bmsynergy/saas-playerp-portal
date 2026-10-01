# Portal / PlayERP-dev contract

Status: applied and verified in PlayERP-dev by Tom (work fc53fb6b-c124-4a58-bc6d-4b77b40db607, artifact 490ffcc6-7695-4820-9aa5-fcf17201b84c). Migration 20261001120000 from backend commit 34e1ab5655711242e572064ddd52c2d006e0c670. Production untouched.

Sources: Tom PE-320.2 (work 921c53bc-4927-4bdc-8a05-e20435ca0e89), approved plan PE-320.1, PE-307 inventory 2320182c-7ea2-41a9-b358-c7c381b7e691, CD-90 target 59da58a0-3500-41ce-b836-ddbe10919ca3. Reuse target playerp.dev. Never provision infrastructure or alter Lovable.

Project: fzwzmwstxlsxdzdmphyq (PlayERP-dev), origin https://playerp.dev.bmore.app. Public URL/anon browser key in src/lib/config.ts: no env_file changes required. No service-role credential.

## RPCs, authenticated only

All RPCs use auth.uid(), SECURITY DEFINER, an empty search_path, qualified tables and explicit fields. Permission failures use SQLSTATE 42501. No table grants or public SELECT policy added.

- portal_access() -> { is_platform_staff: boolean, owner_venues: OwnerVenue[] }. Internal access requires active platform_staff_members with role super_admin through is_platform_staff(ARRAY['super_admin']). staff_roles.super_admin never implies platform access. Owner requires staff_roles.owner AND an explicit staff_venue_assignments row per venue; no operational-super-admin fallback.
- portal_owner_venues(p_venue_id uuid DEFAULT NULL) -> OwnerVenue[]. Owner role required; non-null unassigned id rejected. Returns only assigned venues. App uses this RPC when selecting a venue, in addition to the initial allowed list.
- portal_tenant_directory() -> OwnerVenue[]. Active platform staff only. No billing/support joins.
- portal_tenant_detail(p_venue_id uuid) -> {venue:OwnerVenue,print_servers:PrintServerSummary[]} or null when absent. Active platform staff only.

OwnerVenue: id, name, slug, city, state, address, phone, email, timezone, is_active (nullable boolean). PrintServerSummary: id, venue_id, software_version (nullable), last_seen_at (nullable timestamp), status (pending/active/revoked). No other database columns are serialized.

Read source: public.print_servers, venue_id references the tenant/venue; NOT cloud_printers. Signal contract confirmed by Tom: revoked always Revoked; pending always Pending; active last_seen_at less than 3 min old Online (aligned with ps_panel_state); older/future timestamp No recent signal; null or invalid No signal recorded. Timestamp is displayed independently. No synthetic timestamp/version.

Migration prepared in bmsynergy/saas-playerp-backend branch uma/portal-read-contract-21b82e75 (commit 34e1ab5), _migrations/20261001120000_portal_dev_safe_reads.sql. Tom reviewed schema/grants and applied this exact migration only in DEV.

## Auth coordination completed

Tom appended https://playerp.dev.bmore.app/** to uri_allow_list, preserving site_url, both Lovable entries and global session settings. resetPasswordForEmail uses origin + /auth/password?recovery=1. The source auth-email-hook/_shared/render-auth-email.ts builds the GoTrue verify URL with token_hash + type + redirect_to; Tom verified a real recovery send, redirect, password change and subsequent login; email HTML could not be read because the mail provider key is send-only.

SDK: implicit recovery callback (works across browsers), persistent per-origin session, autoRefreshToken, local logout. Capture PASSWORD_RECOVERY before routing; force password screen while recovery pending. Strip URL callback errors, never display raw provider errors. Password success routes through /auth/complete to allowed owner/admin scope. Recovery state survives refresh in sessionStorage. Password requires 12 characters and UI confirmation.

References used for SDK behavior: https://supabase.com/docs/reference/javascript/auth-onauthstatechange and https://supabase.com/docs/reference/javascript/auth-signout .

DEV fixtures supplied and verified by Tom: active platform staff, inactive platform staff, owner one venue, owner multiple venues, ordinary venue role, venue-level super_admin without platform membership, and an unassigned venue/private data negative case. Seven marked test accounts and a restricted DEV mailbox were supplied through a private directory. Do not modify real memberships or expose tokens/passwords. The opt-in live tests revoke only the chosen test session and produce sanitized API/UI evidence. Temporary fixtures and mailbox retirement remain documented in backend commit 7fb0218372c2364aedef5e2b98e959922c68a2ae.

## PE-322.2 — unified access and staff management

Consumes the already deployed backend from `bmsynergy/saas-playerp-backend`,
`tomjr/pe322-platform-staff-admin-dev` at `a2f213b2ea6ab48f929073a0dc68afa1c31e8cea`.
No backend migration, email configuration, production or Lovable change in this step.

- `portal_access` still returns authorized owner venues and the platform **super_admin**
  flag. `is_platform_staff()` additionally identifies any active platform staff, including
  `support`. Both are checked; user metadata and venue roles never grant platform access.
- Active staff starts at `/admin`; authorized owners at `/`; mixed profiles start at
  `/admin` and use the account menu to explicitly select owner scope. The selection survives
  a tab reload, is bound to the user, and is cleared on login/logout. Safe authorized deep
  links are preserved. Unauthorized scope requests redirect before mounting that shell.
- Access queries are keyed by identity and pathname, refreshed on navigation, focus and
  every 60 seconds. The backend independently validates each data/action request.
- `support` has an authorized `/admin` landing with its limited-access explanation; it has
  no directory or staff-management controls and never calls those privileged endpoints.
- `/admin/staff` invokes `platform-staff-admin` for list, set_role, set_status and
  send_recovery. `invite-platform-staff` sends invitations with role and EN/ES locale.
  Mutations require confirmation; own role/status cannot be edited. Errors are allow-listed
  and localized, with no raw provider messages. Failed actions preserve form state.
- New invitations return to `/auth/password?invite=1&lang=en|es`, with Auth's actual invite
  session. Saving the password calls `accept_platform_invitation`; pending state survives
  refresh. Existing-account notices return to the common login; the user explicitly chooses
  **Accept staff invitation**, available from the owner account menu or the access-denied
  page. Login never silently activates an inactive membership.
- Recovery adds the selected language to its portal redirect. Recovery sessions stay on
  the password page until saved; completion resolves authorization again. Local logout
  preserves independent sessions and Lovable's separate origin/storage.
- Display name uses nonblank `full_name`, `name`, then `display_name` from Auth metadata,
  followed by email and finally PlayERP. These fields are presentation only.
- Four PNGs are exact copies of `bmsynergy/playerp/public/brand` at
  `73655c61f101dbe75429c1fa586f8280782915d9`; neither the source assets nor that repo changed.
