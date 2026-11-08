import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn(), auth: {} } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'u1', email: 'fixture@example.invalid' } }, loading: false, recovery: false, invitation: false, expire: vi.fn() }) }));
vi.mock('../src/locales', async () => { const { en } = await import('../src/locales/en'); return { useLocale: () => ({ locale: 'en', setLocale: vi.fn(), t: (k:string) => (en as Record<string,string>)[k] ?? k }) }; });
import App from '../src/App';
import live from '../docs/evidence/pe469/live-contract.json';
import { projectResolvedDevice } from '../src/lib/psResolvedDevice';

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({matches:false,addEventListener(){},removeEventListener(){}}), localStorage: {getItem:()=>null,setItem(){}}, location:{hash:''} }));
afterEach(() => vi.unstubAllGlobals());
describe('PE-603.4 full device sheet role boundary', () => {
  for (const role of ['owner','admin'] as const) it(`${role} sees About; administrative actions remain scoped`, () => {
    const raw = structuredClone(live.resolved[0]) as any;
    raw.requested_id=raw.device_id;raw.resolved_via='device_id';raw.arch='arm64';
    raw.is_staff=role==='admin';raw.can_manage=role==='admin';
    raw.link.sync.confirmed=false;raw.compat.capabilities.link_ack.available=[{version:'0.3.28',edition_id:'fixture-edition',enabled_rings:['PRIVATE_RING_SENTINEL'],retired:false}];
    for(const key of Object.keys(raw.capabilities))raw.capabilities[key].allowed=role==='admin';
    const d=projectResolvedDevice(raw,raw.device_id),venue={...d.venue!,is_owner:true};
    const path=role==='admin'?d.canonical_path:`/?venue=${venue.id}&section=print-servers&device=${d.device_id}`;
    const qc=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
    qc.setQueryData(['access','u1',path.split('?')[0]], {is_platform_staff:role==='admin',can_manage_staff:role==='admin',can_view_tenants:role==='admin',platform_role:role==='admin'?'super_admin':null,owner_venues:role==='owner'?[venue]:[]});
    qc.setQueryData(['directory','u1'],[venue]);
    qc.setQueryData(['owner-venue','u1',venue.id],[venue]);
    qc.setQueryData(['ps-device-resolve','u1',d.device_id],d);
    const html=renderToStaticMarkup(createElement(QueryClientProvider,{client:qc},createElement(MemoryRouter,{initialEntries:[path]},createElement(App))));
    expect(html).toContain('data-testid="ps-device-sheet"');
    expect(html).toContain('About this Print Server');expect(html).toContain('arm64');
    expect(html).not.toContain('data-testid="ps-technical-details"');
    if(role==='owner') {
      expect(html).not.toContain('PRIVATE_RING_SENTINEL');
      for(const id of ['ps-unlink','ps469-assign','ps-stock','ps-setup','admin-device-channel','ps-setup-firmware'])expect(html).not.toContain(`data-testid="${id}"`);
      expect(qc.getQueryCache().find({queryKey:['ps-stock-status','u1',d.device_id]})?.state.fetchStatus).not.toBe('fetching');
    } else expect(html).toContain('data-testid="ps-unlink"');
    qc.clear();
  });
});
