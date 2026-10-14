import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { getMcpIntegration, mcpErrorKey } from '../src/lib/mcp';
import { destination, safeNext } from '../src/lib/access';
import type { PortalAccess } from '../src/lib/types';

const venue = '76f205a2-dc67-42db-b73e-a9c899af8d9d';
const ok = (data: unknown) => ({ abortSignal: () => Promise.resolve({ data, error: null }), then: (r: (v: unknown) => unknown) => r({ data, error: null }) });
beforeEach(() => rpc.mockReset());

describe('PE-458 Integrations / AI-MCP', () => {
  it('lists only clients the backend publishes as MCP clients', async () => {
    rpc.mockReturnValue(ok({ venue_id: venue, efectivo: true, motivo: 'habilitado', entorno: 'DEV', endpoint: 'https://x.supabase.co/functions/v1/mcp-analytics',
      clientes: [{ nombre: 'ChatGPT', tipo: 'cliente_mcp' }, { nombre: 'Claude', tipo: 'cliente_mcp' }, { nombre: 'Cursor', tipo: 'cliente_mcp' }, { nombre: 'Grok', tipo: 'proveedor' }] }));
    const out = await getMcpIntegration(venue);
    expect(rpc).toHaveBeenCalledWith('mcp_integracion_estado', { p_venue_id: venue });
    expect(out.clientes.map(c => c.nombre)).toEqual(['ChatGPT', 'Claude', 'Cursor']);
    expect(out.endpoint).toBe('https://x.supabase.co/functions/v1/mcp-analytics');
  });
  it('rejects an answer for another venue and maps unknown reasons conservatively', async () => {
    rpc.mockReturnValue(ok({ venue_id: 'other', efectivo: true, motivo: 'habilitado', clientes: [] }));
    await expect(getMcpIntegration(venue)).rejects.toThrow('accessDenied');
    rpc.mockReturnValue(ok({ venue_id: venue, efectivo: false, motivo: '???', endpoint: 'javascript:alert(1)', clientes: [] }));
    const out = await getMcpIntegration(venue);
    expect(out.motivo).toBe('piloto_inactivo');
    expect(out.endpoint).toBeNull();
  });
  it('maps backend refusals to localized keys only', () => {
    expect(mcpErrorKey({ code: '42501', message: 'forbidden' })).toBe('accessDenied');
    expect(mcpErrorKey({ code: '22023', message: 'mcp_motivo_required' })).toBe('mcp.error.reasonRequired');
  });
  it('keeps the new routes in the login allow-list without granting scope', () => {
    const admin: PortalAccess = { is_platform_staff: true, can_manage_staff: true, can_view_tenants: true, platform_role: 'super_admin', owner_venues: [] };
    const ops: PortalAccess = { ...admin, can_manage_staff: false, platform_role: 'operations' };
    expect(safeNext(`/?venue=${venue}&section=integrations`)).toBe(`/?venue=${venue}&section=integrations`);
    expect(destination(admin, '/admin/mcp')).toBe('/admin/mcp');
    expect(destination(ops, '/admin/mcp')).toBe('/admin');
  });
});
