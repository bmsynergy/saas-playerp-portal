import { supabase } from './supabase';
import { PortalError, errorCode } from './errors';

// PE-458: MCP switch per tenant (= owner account) and per venue, and the owner's Integrations / AI-MCP state.
// The backend decides everything (super_admin for /admin/mcp, venue owner for the integration state) and
// answers 42501 otherwise; these projections only keep the allow-listed fields.
export type McpReason = 'habilitado' | 'tenant_desactivado' | 'sede_desactivada' | 'fuera_del_piloto' | 'piloto_inactivo';
const REASONS: McpReason[] = ['habilitado', 'tenant_desactivado', 'sede_desactivada', 'fuera_del_piloto', 'piloto_inactivo'];
export type McpAdminVenue = { venue_id: string; nombre: string; habilitada: boolean; owners: number; efectivo: boolean; motivo: McpReason; cambiado_en: string | null; motivo_cambio: string | null };
export type McpAdminTenant = { owner_user_id: string; email: string; nombre: string | null; habilitado: boolean; cambiado_en: string | null; motivo: string | null; sedes: McpAdminVenue[] };
export type McpAdminOverview = { piloto: { activo: boolean; entorno: string | null; owner_user_id: string | null; sedes: string[] } | null; tenants: McpAdminTenant[] };
export type McpClient = { nombre: string; comprobado_en: string | null };
export type McpIntegration = { venue_id: string; venue_nombre: string | null; efectivo: boolean; motivo: McpReason; entorno: string | null; endpoint: string | null; clientes: McpClient[] };

const str = (v: unknown) => typeof v === 'string' ? v : null;
const reason = (v: unknown): McpReason => REASONS.includes(v as McpReason) ? v as McpReason : 'piloto_inactivo';
async function rpc(name: string, params: Record<string, unknown> = {}, signal?: AbortSignal) {
  const req = supabase.rpc(name, params);
  const { data, error } = await (signal ? req.abortSignal(signal) : req);
  if (error) throw error;
  return data;
}

export async function getMcpAdminOverview(signal?: AbortSignal): Promise<McpAdminOverview> {
  const data = await rpc('mcp_admin_overview', {}, signal);
  if (!data || !Array.isArray(data.tenants)) throw new PortalError('genericError');
  const p = data.piloto;
  return {
    piloto: p ? { activo: p.activo === true, entorno: str(p.entorno), owner_user_id: str(p.owner_user_id), sedes: Array.isArray(p.sedes) ? p.sedes.filter((x: unknown) => typeof x === 'string') : [] } : null,
    tenants: data.tenants.map((t: Record<string, unknown>) => {
      if (typeof t.owner_user_id !== 'string') throw new PortalError('genericError');
      return {
        owner_user_id: t.owner_user_id, email: str(t.email) ?? '', nombre: str(t.nombre), habilitado: t.habilitado !== false,
        cambiado_en: str(t.cambiado_en), motivo: str(t.motivo),
        sedes: (Array.isArray(t.sedes) ? t.sedes : []).map((s: Record<string, unknown>) => ({
          venue_id: String(s.venue_id), nombre: str(s.nombre) ?? '', habilitada: s.habilitada !== false,
          owners: typeof s.owners === 'number' ? s.owners : 1, efectivo: s.efectivo === true, motivo: reason(s.motivo),
          cambiado_en: str(s.cambiado_en), motivo_cambio: str(s.motivo_cambio),
        })),
      };
    }),
  };
}
export async function setMcpTenant(ownerId: string, enabled: boolean, motivo: string) {
  return rpc('mcp_admin_set_tenant', { p_owner: ownerId, p_habilitado: enabled, p_motivo: motivo });
}
export async function setMcpVenue(venueId: string, enabled: boolean, motivo: string) {
  return rpc('mcp_admin_set_venue', { p_venue: venueId, p_habilitado: enabled, p_motivo: motivo });
}
export async function getMcpIntegration(venueId: string, signal?: AbortSignal): Promise<McpIntegration> {
  const data = await rpc('mcp_integracion_estado', { p_venue_id: venueId }, signal);
  if (!data || data.venue_id !== venueId) throw new PortalError('accessDenied');
  const endpoint = str(data.endpoint);
  return {
    venue_id: venueId, venue_nombre: str(data.venue_nombre), efectivo: data.efectivo === true, motivo: reason(data.motivo),
    entorno: str(data.entorno), endpoint: endpoint && /^https:\/\//.test(endpoint) ? endpoint : null,
    clientes: (Array.isArray(data.clientes) ? data.clientes : [])
      .filter((c: Record<string, unknown>) => typeof c.nombre === 'string' && c.tipo === 'cliente_mcp')
      .map((c: Record<string, unknown>) => ({ nombre: c.nombre as string, comprobado_en: str(c.comprobado_en) })),
  };
}
// Backend error text never reaches presentation: only known codes map to localized keys.
export function mcpErrorKey(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === '42501') return 'accessDenied';
  if (e?.message?.includes('mcp_motivo_required')) return 'mcp.error.reasonRequired';
  if (e?.message?.includes('mcp_tenant_unknown') || e?.message?.includes('mcp_venue_unknown')) return 'mcp.error.unknown';
  return errorCode(error);
}
