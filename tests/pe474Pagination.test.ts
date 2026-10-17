import {beforeEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:mocks.rpc,auth:{getSession:mocks.getSession}}}));
import {getOtaOverview,getOtaPage,deployEdition} from '../src/lib/ota';
import {promoteFirmwareEdition} from '../src/lib/firmware';
import {EMPTY_LIST_FILTERS} from '../src/lib/adminLists';
import {lifecycle,overview} from './fixtures/pe474';
beforeEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();});
describe('PE474 bounded server reads over 2000 records / isolated responses',()=>{
 it('overview makes exactly one summary call, never auxiliary inventory',async()=>{
  mocks.rpc.mockResolvedValue({data:overview()});const p=await getOtaOverview();expect(p.totals.devices).toBe(2000);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('ps_ota_admin_overview',{p_include_audit:false});
 });
 it('catalog sends search/status/ring/model/arch with limit/offset and never preloads remaining pages',async()=>{
  const items=Array.from({length:25},(_,i)=>({id:`release-${i+50}`,version:`9.0.${i+50}`,status:'ready',lifecycle:lifecycle(),sha256:'a'.repeat(64)}));
  mocks.rpc.mockResolvedValue({data:{ok:true,total:2000,limit:25,offset:50,releases:items}});
  const p=await getOtaPage('firmwares',{...EMPTY_LIST_FILTERS,query:' search ',status:'signed',ring:'canary',model:'rpi4-2gb',arch:'arm64'},25,50,null);
  expect(p.items).toHaveLength(25);expect(p.total).toBe(2000);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('ps_firmware_page',{p_limit:25,p_offset:50,p_query:'search',p_status:'signed',p_ring:'canary',p_model:'rpi4-2gb',p_arch:'arm64'});
 });
 it('channels forwards bounded member filter and exact server counts; rejects unbounded response',async()=>{
  const row={print_server_id:'ps',device_id:'device',channel:'lab',channel_revision:3,online:true,update_in_progress:false,href:'/admin/print-servers/devices/device'};
  mocks.rpc.mockResolvedValue({data:{ok:true,total:2000,limit:25,offset:25,rows:[row],counts:{lab:100,canary:100,general:1800}}});
  const p=await getOtaPage('channels',{...EMPTY_LIST_FILTERS,query:'name',channel:'lab',status:'online',venue_id:'venue'},25,25,'group');
  expect(p.counts?.general).toBe(1800);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('ps_ota_channels_page',{p_limit:25,p_offset:25,p_query:'name',p_channel:'lab',p_status:'online',p_venue_id:'venue',p_group_id:'group'});
  mocks.rpc.mockResolvedValue({data:{ok:true,total:2000,limit:2000,offset:0,rows:Array(2000).fill(row)}});
  await expect(getOtaPage('channels',EMPTY_LIST_FILTERS,2000,0,null)).rejects.toThrow();expect(mocks.rpc.mock.lastCall?.[1].p_limit).toBe(100);
 });
 it('refresh preserves requested filter/page and a failure throws instead of showing an empty success',async()=>{
  const filters={...EMPTY_LIST_FILTERS,query:'version',status:'signed'};
  mocks.rpc.mockResolvedValue({data:{ok:true,total:2000,limit:25,offset:25,releases:[]}});
  await getOtaPage('firmwares',filters,25,25,null);mocks.rpc.mockResolvedValue({error:{code:'XX000'}});
  await expect(getOtaPage('firmwares',filters,25,25,null)).rejects.toMatchObject({code:'XX000'});expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 });
 it('active Updates UI has no complete event/inventory/catalog download path',()=>{
  const ui=readFileSync('src/pages/PrintUpdatesPage.tsx','utf8');expect(ui).not.toMatch(/getTargetEvents|getInventoryDevices|getFirmwares|data\.devices|data\.releases/);
  expect(ui).toContain("useOtaPage('events',targetId)");expect(ui).toContain("useOtaPage('channels')");
 });
 it('promotion writes only edition/ring/expected revision, never artifact metadata, ACK or deployment',async()=>{
  mocks.rpc.mockResolvedValue({data:{ok:true}});
  await promoteFirmwareEdition('same-edition','canary',0);await promoteFirmwareEdition('same-edition','general',1);
  expect(mocks.rpc.mock.calls).toEqual([['ps_ota_edition_promote',{p_edition_id:'same-edition',p_ring:'canary',p_expected_revision:0}],['ps_ota_edition_promote',{p_edition_id:'same-edition',p_ring:'general',p_expected_revision:1}]]);
  mocks.rpc.mockResolvedValue({data:{ok:false,error:'availability_changed',revision:2}});
  await expect(promoteFirmwareEdition('same-edition','general',1)).rejects.toMatchObject({key:'fw.lifecycle.error.availabilityChanged'});expect(mocks.rpc).toHaveBeenCalledTimes(3);
 });
 it.each(['device_channel_not_enabled','not_newer'])('all-or-nothing deploy refusal %s keeps affected devices',async error=>{
  mocks.getSession.mockResolvedValue({data:{session:{access_token:'synthetic'}}});
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:false,error,devices:[{print_server_id:'affected',channel:'lab',installed_version:'9.0.0',secret:'discard'}]}),{status:409}));vi.stubGlobal('fetch',fetch);
  const e=await deployEdition('edition',{group_id:'group'}).catch(e=>e);expect(e.code).toBe(error);expect(e.devices[0].print_server_id).toBe('affected');expect(JSON.stringify(e)).not.toContain('discard');expect(fetch).toHaveBeenCalledTimes(1);
 });
});
