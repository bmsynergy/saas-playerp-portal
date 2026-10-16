import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { getMcpVenue, mcpErrorKey } from '../src/lib/mcp';
import { destination, safeNext } from '../src/lib/access';
import type { PortalAccess } from '../src/lib/types';

const venue = '76f205a2-dc67-42db-b73e-a9c899af8d9d';
const ok = (data: unknown) => ({ abortSignal: () => Promise.resolve({ data, error: null }), then: (r: (v: unknown) => unknown) => r({ data, error: null }) });
beforeEach(() => rpc.mockReset());

describe('PE-464 shared venue contract', () => {
  const detail={venue_id:venue,revision:0,primera_activacion_en:null,rate:{version:1,amount:'0.00',currency:'USD',interval:'month'},owners:[],acceptance:{current:false},capabilities:{can_manage:true,can_accept:false},clientes:[]};
  it('uses shared detail and never treats missing flags as enabled', async () => {
    rpc.mockReturnValue(ok(detail));
    const out=await getMcpVenue(venue);
    expect(rpc).toHaveBeenCalledWith('mcp_venue_detail',{p_venue_id:venue});
    expect(out.habilitado).toBe(false);
    expect(out.acceptance.current).toBe(false);
  });
  it('rejects cross-venue answers and unsafe endpoints', async () => {
    rpc.mockReturnValue(ok({...detail,venue_id:'other'}));
    await expect(getMcpVenue(venue)).rejects.toThrow('accessDenied');
    rpc.mockReturnValue(ok({...detail,endpoint:'javascript:alert(1)'}));
    expect((await getMcpVenue(venue)).endpoint).toBeNull();
  });
  it('rejects an absent or invalid first-activation marker rather than enabling all owners again', async () => {
    for (const marker of [undefined, false, 'invalid']) {
      rpc.mockReturnValue(ok({...detail,primera_activacion_en:marker}));
      await expect(getMcpVenue(venue)).rejects.toThrow('genericError');
    }
  });
  it('maps authorization and configuration/rate conflicts without server text',()=>{
    expect(mcpErrorKey({code:'42501',message:'private'})).toBe('accessDenied');
    expect(mcpErrorKey({code:'PT409',message:'private'})).toBe('mcp.error.conflict');
  });
  it('keeps the new routes in the login allow-list without granting scope', () => {
    const admin: PortalAccess = { is_platform_staff: true, can_manage_staff: true, can_view_tenants: true, platform_role: 'super_admin', owner_venues: [] };
    const ops: PortalAccess = { ...admin, can_manage_staff: false, platform_role: 'operations' };
    expect(safeNext(`/?venue=${venue}&section=integrations`)).toBe(`/?venue=${venue}&section=integrations`);
    expect(destination(admin, '/admin/mcp')).toBe('/admin/mcp');
    expect(destination(ops, '/admin/mcp')).toBe('/admin');
  });
});
