import type { PortalAccess } from './types';
export type Scope = 'owner' | 'admin';
export function safeNext(value: string | null): string | null {
  return value && (/^\/(?:\?venue=[a-f0-9-]+)?$/.test(value) || /^\/admin(?:\/staff|\/tenants(?:\/[a-f0-9-]+)?)?$/.test(value)) ? value : null;
}
// A requested URL never grants a scope. Staff starts in administration even if
// login was reached through /. Only the account menu selects the owner scope.
export function destination(access: PortalAccess, next: string | null = null): string | null {
  const safe = safeNext(next);
  if (access.is_platform_staff) {
    return safe?.startsWith('/admin') && (access.can_manage_staff || safe === '/admin') ? safe : '/admin';
  }
  if (access.owner_venues.length) return safe && !safe.startsWith('/admin') ? safe : '/';
  return null;
}
export function displayName(user: { email?: string; user_metadata?: Record<string, unknown> }): string {
  // Display only. These user-editable values are never authorization inputs.
  for (const key of ['full_name', 'name', 'display_name']) {
    const value = user.user_metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return user.email?.trim() || 'PlayERP';
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
