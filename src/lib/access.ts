import type { PlatformRole, PortalAccess } from './types';
export type Scope = 'owner' | 'admin';
export function safeNext(value: string | null): string | null {
  return value && (/^\/(?:\?venue=[a-f0-9-]+)?$/.test(value) || /^\/admin(?:\/staff|\/(?:tenants|print-servers)(?:\/[a-f0-9-]+)?|\/tenants\/[a-f0-9-]+\/(?:users|print-servers(?:\/detail)?))?$/.test(value)) ? value : null;
}
// A requested URL never grants a scope. Staff starts in administration even if
// login was reached through /. Only the account menu selects the owner scope.
export function destination(access: PortalAccess, next: string | null = null): string | null {
  const safe = safeNext(next);
  if (access.is_platform_staff) {
    if (!safe?.startsWith('/admin') || safe === '/admin') return '/admin';
    // Tenants: Admin and Operations. Venue Users/Print Servers, staff and the fleet: Admin only.
    return (safe.startsWith('/admin/tenants') && !safe.endsWith('/users') && !safe.includes('/print-servers') ? access.can_view_tenants : access.can_manage_staff) ? safe : '/admin';
  }
  if (access.owner_venues.length) return safe && !safe.startsWith('/admin') ? safe : '/';
  return null;
}
// Pure projection of the two backend answers. `staff` is any active platform
// membership; `admin` is the portal_access flag that is true only for Admin.
export function platformAccess(staff: boolean, admin: boolean, role: unknown): Pick<PortalAccess, 'is_platform_staff' | 'can_manage_staff' | 'can_view_tenants' | 'platform_role'> {
  const platform_role = staff && (role === 'super_admin' || role === 'support' || role === 'operations') ? role as PlatformRole : null;
  const can_manage_staff = staff && admin;
  return { is_platform_staff: staff, can_manage_staff, platform_role,
    can_view_tenants: platform_role ? platform_role !== 'support' : can_manage_staff };
}
export function displayName(user: { email?: string }, profile?: { first_name?: unknown; last_name?: unknown } | null): string {
  // staff_profiles is presentation only, never an authorization input.
  const name = [profile?.first_name, profile?.last_name]
    .filter((part): part is string => typeof part === 'string' && !!part.trim())
    .map(part => part.trim()).join(' ');
  return name || user.email?.trim() || 'PlayERP';
}
const key = (id: string) => `playerp.portal.scope.${id}`;
export function preferredScope(id: string): Scope | null {
  try { const value=sessionStorage.getItem(key(id)); return value==='owner'||value==='admin'?value:null; } catch { return null; }
}
export function chooseScope(id: string, scope: Scope) {
  try { sessionStorage.setItem(key(id),scope); } catch { /* route remains usable */ }
}
export function clearScopes() {
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('playerp.portal.scope.')) sessionStorage.removeItem(k); } catch { /* storage unavailable */ }
}
