import { AUXILIARY_STORAGE_PREFIX } from './config';
import type { PlatformRole, PortalAccess } from './types';
export type Scope = 'owner' | 'admin';
export function safeNext(value: string | null): string | null {
  if (!value || /[\\#\s]/.test(value) || !value.startsWith('/') || value.startsWith('//') || /%2f|%5c|%2e/i.test(value)) return null;
  const [path, query = ''] = value.split('?');
  if (value.split('?').length > 2 || path.includes('/../') || path.includes('/./')) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const params = new URLSearchParams(query);
  if (new Set([...params.keys()]).size !== [...params.keys()].length) return null;
  const only = (keys:string[]) => [...params.keys()].every(k => keys.includes(k));
  const id = (key:string) => !params.has(key) || uuid.test(params.get(key)!);
  if(path === '/oauth/consent') return only(['request_id']) && uuid.test(params.get('request_id') ?? '') ? value : null;
  if(path === '/') {
    if(!only(['venue','section','device','selected']) || !id('venue') || !id('device') || !id('selected'))return null;
    if(params.has('section') && !params.has('venue'))return null;
    if(params.has('section') && !['details','users','print-servers','integrations'].includes(params.get('section')!))return null;
    if((params.has('device')||params.has('selected')) && (params.get('section')!=='print-servers'||!params.has('venue')))return null;
    return value;
  }
  if(/^\/admin\/print-servers\/devices\/[0-9a-f-]+$/.test(path)) {
    return uuid.test(path.split('/').at(-1)!) && only(['fromVenue']) && id('fromVenue') ? value : null;
  }
  if(path==='/admin/print-servers/inventory')return only(['fromVenue','selected','create'])&&id('fromVenue')&&id('selected')&&(!params.has('create')||params.get('create')==='1')?value:null;
  if(/^\/admin\/tenants\/[0-9a-f-]+\/print-servers$/.test(path))return uuid.test(path.split('/')[3])&&only(['selected'])&&id('selected')?value:null;
  if(path==='/admin/print-servers/channels')return only(['channel','q','status','venue','venueName','group','page','lang']) ? value : null;
  if(query)return null;
  return /^\/admin(?:\/staff|\/mcp|\/(?:tenants|print-servers)(?:\/[a-f0-9-]+)?|\/print-servers\/(?:list|firmwares|updates)|\/tenants\/[a-f0-9-]+\/(?:users|mcp|print-servers(?:\/detail)?))?$/.test(path)?value:null;
}
// A requested URL never grants a scope. Staff starts in administration even if
// login was reached through /. Only the account menu selects the owner scope.
export function destination(access: PortalAccess, next: string | null = null): string | null {
  const safe = safeNext(next);
  // The consent RPC checks owner rights itself, including for mixed staff/owner accounts.
  if (safe?.startsWith('/oauth/consent?')) return safe;
  if (access.is_platform_staff) {
    if (!safe?.startsWith('/admin') || safe === '/admin') return '/admin';
    // Tenants: Admin and Operations. Venue Users/Print Servers, staff and the fleet: Admin only.
    return (safe.startsWith('/admin/tenants') && !safe.endsWith('/users') && !safe.endsWith('/mcp') && !safe.includes('/print-servers') ? access.can_view_tenants : access.can_manage_staff) ? safe : '/admin';
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
const key = (id: string) => `${AUXILIARY_STORAGE_PREFIX}scope.${id}`;
export function preferredScope(id: string): Scope | null {
  try { const value=sessionStorage.getItem(key(id)); return value==='owner'||value==='admin'?value:null; } catch { return null; }
}
export function chooseScope(id: string, scope: Scope) {
  try { sessionStorage.setItem(key(id),scope); } catch { /* route remains usable */ }
}
export function clearScopes() {
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(`${AUXILIARY_STORAGE_PREFIX}scope.`)) sessionStorage.removeItem(k); } catch { /* storage unavailable */ }
}

// Rings follow the explicit super_admin contract, independently of broad staff navigation.
export function canManageRings(access: PortalAccess | undefined): boolean {
  return !!access?.can_manage_staff && access.platform_role === 'super_admin';
}
