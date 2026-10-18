import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:mocks.rpc,auth:{getSession:mocks.getSession}}}));
import {getPanelOta,updateOwnedDevice} from '../src/lib/ota';
import {projectAdminDeviceDetail,updateAdminDevice} from '../src/lib/psAdminDevice';
import {deviceSheet,deviceUpdate,signedAt} from './fixtures/pe474';
const general={edition_id:'general-edition',version:'0.3.20',model:'rpi4-2gb',arch:'arm64',signed_at:signedAt};
const owner=(patch:Record<string,unknown>={})=>({ok:true,print_servers:[{print_server_id:'ps',installed_version:'0.3.19',model:general.model,arch:general.arch,update:{device_id:'device',current_version:'0.3.19',latest_stable:general,candidate:{edition_id:general.edition_id,version:general.version,signed_at:signedAt},can_update:true,update_available:true,reason:null,...patch}}]});
beforeEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();mocks.getSession.mockResolvedValue({data:{session:{access_token:'synthetic'}}});});
describe('PE474 OWNER / ADMIN permissions (all writes intercepted)',()=>{
 it.each(['up_to_date','newer_not_enabled','newer_incompatible','update_in_progress','device_not_active','metadata_missing'])('OWNER preserves reason %s without revealing internal channels or hashes',async reason=>{
  mocks.rpc.mockResolvedValue({data:owner({latest_stable:null,candidate:null,reason,newer_signed_unpromoted:reason==='newer_not_enabled',can_update:false,update_available:false,channel:{ring:'lab'},sha256:'secret-hash',editions:[{secret:'hidden'}]})});
  const p=(await getPanelOta('venue'))[0];expect(p.reason).toBe(reason);expect(p.can_update).toBe(false);expect(JSON.stringify(p)).not.toMatch(/secret-hash|hidden|"channel"|"lab"/);
 });
 it('OWNER confirms server candidate identity rather than assuming latest_stable is the installable candidate',async()=>{
  mocks.rpc.mockResolvedValue({data:owner({latest_stable:{...general,edition_id:'different'}})});const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true})));vi.stubGlobal('fetch',fetch);
  await updateOwnedDevice('venue','device',general.edition_id,'0.3.19');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({action:'update_owned_device',venue_id:'venue',device_id:'device',edition_id:general.edition_id,expected_installed_version:'0.3.19'});
 });
 for(const [name,patch] of Object.entries({staff:{can_update:false},unsigned:{candidate:{edition_id:general.edition_id,version:general.version}},notNewer:{candidate:{...general,version:'0.3.19'}},foreign:{device_id:'foreign'},changed:{candidate:{...general,edition_id:'different'}},busy:{reason:'update_in_progress',can_update:false}}))it(`OWNER ${name}: zero writes`,async()=>{
  mocks.rpc.mockResolvedValue({data:owner(patch)});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(updateOwnedDevice('venue','device',general.edition_id,'0.3.19')).rejects.toBeTruthy();expect(fetch).not.toHaveBeenCalled();
 });
 it('ADMIN uses only explicit installable server options without General fallback',async()=>{
  const u=deviceUpdate('0.3.21','0.3.19','unpromoted-edition','lab');u.latest_stable=null as never;
  expect(projectAdminDeviceDetail(deviceSheet(u)).update).toMatchObject({latest_stable:null,effective_ring:'lab',can_update:true,candidate:{version:'0.3.21'}});
  mocks.rpc.mockResolvedValue({data:deviceSheet(u)});const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,deployment_id:'synthetic'})));vi.stubGlobal('fetch',fetch);
  await updateAdminDevice('device','unpromoted-edition','0.3.19');expect(fetch).toHaveBeenCalledOnce();
 });
 it('old ADMIN metadata fails closed and obsolete newest_signed is not cached',()=>{
  const u=deviceUpdate();expect(projectAdminDeviceDetail(deviceSheet({...u,editions:undefined,newest_signed:{secret:'hidden'}})).update).toMatchObject({can_update:false,newest_signed:null});
 });
});
