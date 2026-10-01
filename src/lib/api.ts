import { supabase } from './supabase';
import { PortalError } from './errors';
import { platformAccess } from './access';
import type { OwnerVenue, PortalAccess, PrintServerSummary, TenantDetail } from './types';

// Both the RPC and this projection use an explicit allow-list. No table SELECTs,
// payment payloads, raw auth responses, or server error text reach presentation.
const nullable = (v: unknown) => typeof v === 'string' ? v : null;
function venue(v: Record<string, unknown>): OwnerVenue {
  if (typeof v.id !== 'string' || typeof v.name !== 'string') throw new PortalError('genericError');
  return {id: v.id, name: v.name, slug: nullable(v.slug), city: nullable(v.city),
    state: nullable(v.state), address: nullable(v.address), phone: nullable(v.phone),
    email: nullable(v.email), timezone: nullable(v.timezone), is_active: typeof v.is_active === 'boolean' ? v.is_active : null};
}
function server(v: Record<string, unknown>): PrintServerSummary {
  if (typeof v.id !== 'string' || typeof v.venue_id !== 'string' || !['pending','active','revoked'].includes(String(v.status))) throw new PortalError('genericError');
  return {id:v.id,venue_id:v.venue_id,software_version:nullable(v.software_version),last_seen_at:nullable(v.last_seen_at),status:v.status as PrintServerSummary['status']};
}
async function rpc(name: string, params: Record<string, unknown> = {}, signal?: AbortSignal) {
  const req = supabase.rpc(name, params);
  const {data,error} = await (signal ? req.abortSignal(signal) : req);
  if (error) throw error;
  return data;
}
export async function getAccess(signal?: AbortSignal): Promise<PortalAccess> {
  const [data, staff] = await Promise.all([rpc('portal_access', {}, signal), rpc('is_platform_staff', {}, signal)]);
  if (!data || typeof data.is_platform_staff !== 'boolean' || !Array.isArray(data.owner_venues)) throw new PortalError('genericError');
  if (typeof staff !== 'boolean') throw new PortalError('genericError');
  return { ...platformAccess(staff, data.is_platform_staff, data.platform_role), owner_venues: data.owner_venues.map(venue) };
}
export async function getDirectory(signal?: AbortSignal): Promise<OwnerVenue[]> {
  const data = await rpc('portal_tenant_directory', {}, signal);
  if (!Array.isArray(data)) throw new PortalError('genericError');
  return data.map(venue);
}
export async function getTenant(id: string, signal?: AbortSignal): Promise<TenantDetail | null> {
  const data = await rpc('portal_tenant_detail', {p_venue_id:id}, signal);
  if (data === null) return null;
  if (!data?.venue || !Array.isArray(data.print_servers)) throw new PortalError('genericError');
  return {venue:venue(data.venue),print_servers:data.print_servers.map(server)};
}
export async function getOwnerVenues(id: string, signal?: AbortSignal): Promise<OwnerVenue[]> {
  const data = await rpc('portal_owner_venues', {p_venue_id:id}, signal);
  if (!Array.isArray(data)) throw new PortalError('genericError');
  return data.map(venue);
}
