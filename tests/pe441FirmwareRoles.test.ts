import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:mocks.rpc,auth:{getSession:mocks.getSession}}}));
import {getPanelOta,updateOwnedDevice} from '../src/lib/ota';
import {projectAdminDeviceDetail,updateAdminDevice} from '../src/lib/psAdminDevice';
const general={edition_id:'general-edition',version:'0.3.20',model:'rpi4-2gb',arch:'arm64'};
const candidate={...general,edition_id:'unpromoted-edition',version:'0.3.21',ring:'canary',general_eligible:false,eligibility_reason:'canary_not_confirmed',admitted:true,admitted_ring:'lab',canary_confirmed_at:null,lab_only:false,signed_at:'2026-10-13T22:53:38Z'};
const owner=(update:Record<string,unknown>={})=>({ok:true,print_servers:[{print_server_id:'ps',installed_version:'0.3.19',model:general.model,arch:general.arch,update:{device_id:'device',current_version:'0.3.19',latest_stable:general,can_update:true,update_available:true,reason:null,...update}}]});
const admin=(update:Record<string,unknown>={})=>({ok:true,device:{id:'device',serial:'PS-TEST',hostname:'test',model:general.model,arch:general.arch,status:'assigned',venue_id:'venue'},update:{current_version:'0.3.19',latest_stable:null,candidate,newest_signed:candidate,effective_ring:'lab',can_update:true,update_available:true,reason:null,active_update:null,...update},delete:{allowed:false,blockers:['assigned']}});
beforeEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();mocks.getSession.mockResolvedValue({data:{session:{access_token:'synthetic'}}});});
describe('PE-441 separate OWNER / ADMIN contracts (all writes intercepted)',()=>{
 it('OWNER preserves no_general_update when General is absent OR already installed',async()=>{
  for(const stable of [null,{...general,version:'0.3.19'}]){
   mocks.rpc.mockResolvedValue({data:owner({latest_stable:stable,reason:'no_general_update',newer_signed_unpromoted:true,can_update:false,update_available:false})});
   expect((await getPanelOta('venue'))[0]).toMatchObject({reason:'no_general_update',newer_signed_unpromoted:true,can_update:false});
  }
 });
 it('OWNER distinguishes actual absence from errors',async()=>{
  mocks.rpc.mockResolvedValue({data:owner({latest_stable:null,reason:'no_stable_release',can_update:false,update_available:false})});
  expect((await getPanelOta('venue'))[0]).toMatchObject({reason:'no_stable_release',availability:'unavailable'});
  mocks.rpc.mockResolvedValue({error:{code:'XX000'}});await expect(getPanelOta('venue')).rejects.toMatchObject({code:'XX000'});
 });
 it('OWNER confirms exact venue/device/edition/installed to bounded server action',async()=>{
  mocks.rpc.mockResolvedValue({data:owner()});const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true})));vi.stubGlobal('fetch',fetch);
  await updateOwnedDevice('venue','device',general.edition_id,'0.3.19');
  expect(mocks.rpc).toHaveBeenCalledWith('ps_panel_ota',{p_venue_id:'venue'});
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({action:'update_owned_device',venue_id:'venue',device_id:'device',edition_id:general.edition_id,expected_installed_version:'0.3.19'});
 });
 for(const [name,change] of Object.entries({staff:{can_update:false},unpromoted:{latest_stable:null,reason:'no_general_update',can_update:false},notGreater:{latest_stable:{...general,version:'0.3.19'}},foreign:{device_id:'foreign'},editionChanged:{latest_stable:{...general,edition_id:'other'}},inProgress:{reason:'update_in_progress',can_update:false}}))it(`OWNER ${name}: zero edge calls`,async()=>{
  mocks.rpc.mockResolvedValue({data:owner(change)});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(updateOwnedDevice('venue','device',general.edition_id,'0.3.19')).rejects.toBeTruthy();expect(fetch).not.toHaveBeenCalled();
 });
 it('ADMIN sees and can confirm 0.3.21 only in already permitted lab, without General fallback',async()=>{
  const projected=projectAdminDeviceDetail(admin());expect(projected.update).toMatchObject({latest_stable:null,effective_ring:'lab',can_update:true,candidate:{version:'0.3.21',ring:'canary',eligibility_reason:'canary_not_confirmed',general_eligible:false,admitted_ring:'lab'}});
  mocks.rpc.mockResolvedValue({data:admin()});const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,deployment_id:'synthetic'})));vi.stubGlobal('fetch',fetch);
  await updateAdminDevice('device',candidate.edition_id,'0.3.19');expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({action:'update_device',device_id:'device',edition_id:candidate.edition_id,expected_installed_version:'0.3.19'});
 });
 it('ADMIN outside permitted ring sees newest signed but cannot update',()=>{
  expect(projectAdminDeviceDetail(admin({candidate:null,newest_signed:{...candidate,admitted:false,admitted_ring:'general'},effective_ring:'general',can_update:false,update_available:false,reason:'no_general_update'})).update).toMatchObject({candidate:null,can_update:false,reason:'no_general_update',newest_signed:{version:'0.3.21',admitted:false}});
 });
 for(const change of [{can_update:false},{effective_ring:'general'},{candidate:{...candidate,admitted:false}},{candidate:null},{current_version:'0.3.20'},{candidate:{...candidate,edition_id:'changed'}}])it(`ADMIN changed confirmation: zero calls ${JSON.stringify(change)}`,async()=>{
  mocks.rpc.mockResolvedValue({data:admin(change)});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(updateAdminDevice('device',candidate.edition_id,'0.3.19')).rejects.toBeTruthy();expect(fetch).not.toHaveBeenCalled();
 });
 it('ADMIN admits newer signed lab-suffix builds while preserving compatible/permission guards',()=>{
  const lab={...candidate,version:'0.3.22-lab',ring:'lab',eligibility_reason:'lab_build',lab_only:true};
  expect(projectAdminDeviceDetail(admin({candidate:lab})).update.can_update).toBe(true);
  expect(projectAdminDeviceDetail(admin({candidate:lab,current_version:'0.3.22'})).update.can_update).toBe(false);
 });
 it('old ADMIN response cannot silently reuse OWNER General selection',()=>{
  expect(projectAdminDeviceDetail(admin({candidate:undefined,can_update:undefined,latest_stable:general})).update.can_update).toBe(false);
 });
});
