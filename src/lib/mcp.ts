import { supabase } from './supabase';
import { PortalError, errorCode } from './errors';

// PE-464. One persisted contract for both administration surfaces. Never infer consent.
export type McpReason = 'habilitado' | 'tenant_desactivado' | 'sede_desactivada' | 'owner_desactivado' | 'owner_no_autorizado' | 'aceptacion_pendiente' | 'fuera_del_piloto' | 'piloto_inactivo' | 'servicio_inactivo';
export type McpVenueRow = { venue_id: string; nombre: string; habilitado: boolean; owners: number };
export type McpVenueList = { rows: McpVenueRow[]; total: number; page: number; page_size: number };
export type McpFilters = { search: string; owner_search: string; status: 'all' | 'active' | 'inactive'; tenant: string | null; page: number; page_size: number };
export type McpTenantOption = { owner_user_id: string; email: string; nombre: string | null };
export type McpOwner = { owner_user_id: string; email: string; nombre: string | null; habilitado: boolean; efectivo: boolean; motivo: McpReason };
export type McpRate = { version: number; amount: string; currency: string; interval: 'month' };
export type McpVenueDetail = {
  venue_id: string; nombre: string; revision: number; habilitado: boolean; primera_activacion_en: string | null; owners: McpOwner[];
  rate: McpRate; acceptance: { current: boolean; accepted_at: string | null; actor_user_id: string | null; mode?: 'owner' | 'administrative' | null; consent_version?: string | null; operation_id?: string | null };
  capabilities: { can_manage: boolean; can_accept: boolean; acceptance_mode?: 'owner' | 'administrative' };
  endpoint: string | null; entorno: string | null; clientes: { nombre: string; comprobado_en: string | null }[];
};
export type McpSave = { venue_id: string; expected_revision: number; rate_version: number; habilitado: boolean; owners: { owner_user_id: string; habilitado: boolean }[]; accept_monthly: boolean; operation_id: string };
export type McpEditorProps = { data: McpVenueDetail; busy: boolean; error: string | null; onSave: (input: McpSave) => Promise<McpVenueDetail>; onReload: () => Promise<McpVenueDetail>; onDirtyChange?: (dirty: boolean) => void };
async function rpc<T>(name: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const req = supabase.rpc(name, params);
  const { data, error } = await (signal ? req.abortSignal(signal) : req);
  if (error) throw error;
  if (!data) throw new Error('invalid_mcp_response');
  return data as T;
}
export function getMcpVenues(filters: McpFilters, signal?: AbortSignal) {
  return rpc<McpVenueList>('mcp_admin_venues', { p_search: filters.search, p_owner_search: filters.owner_search, p_status: filters.status, p_tenant: filters.tenant, p_page: filters.page, p_page_size: filters.page_size }, signal);
}
export function getMcpTenants(search: string, signal?: AbortSignal) {
  return rpc<McpTenantOption[]>('mcp_admin_tenants', { p_search: search }, signal);
}
export async function getMcpVenue(venueId: string, signal?: AbortSignal) {
  return detail(await rpc<McpVenueDetail>('mcp_venue_detail', { p_venue_id: venueId }, signal), venueId);
}
function publicEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
function detail(data: McpVenueDetail, venueId: string): McpVenueDetail {
  if (data.venue_id !== venueId) throw new PortalError('accessDenied');
  if (!Number.isSafeInteger(data.revision) || !Number.isSafeInteger(data.rate?.version)
    || !(data.primera_activacion_en === null || (typeof data.primera_activacion_en === 'string' && Number.isFinite(Date.parse(data.primera_activacion_en))))
    || !Array.isArray(data.owners) || !data.acceptance || !data.capabilities) throw new PortalError('genericError');
  return { ...data, habilitado: data.habilitado === true,
    acceptance: { ...data.acceptance, current: data.acceptance.current === true },
    capabilities: { can_manage: data.capabilities.can_manage === true, can_accept: data.capabilities.can_accept === true, acceptance_mode: data.capabilities.acceptance_mode === 'administrative' ? 'administrative' : 'owner' },
    owners: data.owners.map(owner => ({ ...owner, habilitado: owner.habilitado === true, efectivo: owner.efectivo === true })),
    endpoint: publicEndpoint(data.endpoint),
    clientes: Array.isArray(data.clientes) ? data.clientes.filter(c => typeof c.nombre === 'string') : [],
  };
}
export async function saveMcpVenue(input: McpSave) {
  return detail(await rpc<McpVenueDetail>('mcp_venue_save', { p_input: input }), input.venue_id);
}
export function mcpErrorKey(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === '42501') return 'accessDenied';
  if (e?.code === 'PT409') return 'mcp.error.conflict';
  if (e?.message?.includes('mcp_acceptance_required')) return 'mcp.error.acceptanceRequired';
  if (e?.message?.includes('mcp_idempotency')) return 'mcp.error.idempotency';
  return errorCode(error);
}
