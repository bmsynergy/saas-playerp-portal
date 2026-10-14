import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:mocks.rpc,auth:{getSession:mocks.getSession}}}));
import {compareFirmware,firmwareBlockReason} from '../src/lib/firmwareEligibility';
import {projectAdminDeviceDetail,updateAdminDevice} from '../src/lib/psAdminDevice';
import {getPanelOta} from '../src/lib/ota';
const stable={edition_id:'edition',version:'0.3.10',model:'rpi4-2gb',arch:'arm64'};
const raw=()=>({ok:true,device:{id:'device',serial:'PS-TEST',hostname:'ps-test',model:stable.model,arch:stable.arch,status:'assigned',venue_id:'venue'},update:{current_version:'0.3.9',latest_stable:stable,candidate:{...stable,ring:'general',general_eligible:true,eligibility_reason:'general',admitted:true,admitted_ring:'general'},effective_ring:'general',can_update:true,update_available:true,reason:null,active_update:null},delete:{allowed:false,blockers:['assigned']}});
beforeEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();mocks.getSession.mockResolvedValue({data:{session:{access_token:'fixture'}}});mocks.rpc.mockResolvedValue({data:raw()});});
describe('Firmware eligibility, read projection and intercepted update confirmation',()=>{
 it('compares 0.3.9 < 0.3.10 numerically, and blocks unknown semver',()=>{
  expect(compareFirmware('0.3.9','0.3.10')).toBe(-1);expect(compareFirmware('0.3.10','0.3.9')).toBe(1);expect(compareFirmware('0.3.10','0.3.10')).toBe(0);
  for(const v of [null,'','unknown','0.3','0.3.10-lab','01.2.3'])expect(compareFirmware(v,'0.3.10')).toBeNull();
 });
 for(const installed of ['0.3.10','0.4.0','1.0.0'])it(`blocks equal/older target vs ${installed}`,()=>{
  const f=raw();f.update.current_version=installed;expect(projectAdminDeviceDetail(f).update).toMatchObject({update_available:false,reason:'up_to_date'});
 });
 it('blocks unknown installed, incompatible model/arch, missing metadata and server denial',()=>{
  expect(firmwareBlockReason(null,stable,stable.model,stable.arch,true,null)).toBe('metadata_missing');
  for(const field of ['model','arch'])expect(firmwareBlockReason('0.3.9',{...stable,[field]:'other'},stable.model,stable.arch,true,null)).toBe('incompatible');
  expect(firmwareBlockReason('0.3.9',null,stable.model,stable.arch,false,null)).toBe('metadata_missing');
  expect(firmwareBlockReason('0.3.9',null,stable.model,stable.arch,false,'no_stable_release')).toBe('no_stable_release');
  expect(firmwareBlockReason('0.3.9',stable,stable.model,stable.arch,false,null)).toBe('not_authorized');
 });
 it('owner uses only scoped ps_panel_ota, drops catalog and never grants writes',async()=>{
  mocks.rpc.mockResolvedValue({data:{ok:true,print_servers:[{print_server_id:'ps',installed_version:'0.3.9',model:stable.model,arch:stable.arch,update:raw().update,can_update:true,editions:[{secret:'privileged'}]}]}});
  const result=await getPanelOta('venue');expect(mocks.rpc).toHaveBeenCalledWith('ps_panel_ota',{p_venue_id:'venue'});
  expect(result[0]).toMatchObject({latest_stable:stable,availability:'available',can_update:false});expect(JSON.stringify(result)).not.toContain('privileged');
 });
 it('old owner contract is unknown, not no available; query failures throw',async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{ok:true,print_servers:[{print_server_id:'ps',installed_version:'0.3.9'}]}});
  expect((await getPanelOta('venue'))[0]).toMatchObject({availability:'unknown',reason:'metadata_missing',can_update:false});
  mocks.rpc.mockResolvedValueOnce({error:{code:'XX000'}});await expect(getPanelOta('venue')).rejects.toMatchObject({code:'XX000'});
 });
 it('revalidates immediately before exact existing update_device payload, no real OTA',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,deployment_id:'fixture-deployment'})));vi.stubGlobal('fetch',fetch);
  await updateAdminDevice('device','edition','0.3.9');expect(mocks.rpc).toHaveBeenCalledWith('ps_admin_device_detail',{p_device_id:'device'});
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({action:'update_device',device_id:'device',edition_id:'edition',expected_installed_version:'0.3.9'});
  expect(fetch.mock.calls[0][0]).toMatch(/\/ps-ota-admin$/);
 });
 for(const change of ['installed','permission','edition','identity','query'])it(`eligibility changed (${change}): zero edge writes`,async()=>{
  const f=raw();if(change==='installed')f.update.current_version='0.3.8';if(change==='permission')f.update.update_available=false;if(change==='edition')f.update.candidate={...f.update.candidate,edition_id:'new'};if(change==='identity')f.device.id='other';
  mocks.rpc.mockResolvedValue(change==='query'?{error:{code:'XX000'}}:{data:f});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(updateAdminDevice('device','edition','0.3.9')).rejects.toBeTruthy();expect(fetch).not.toHaveBeenCalled();
 });
});
