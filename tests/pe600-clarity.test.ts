import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/lib/supabase',()=>({supabase:{}}));
import {firmwareStatus,capabilityReason} from '../src/lib/psFirmwareStatus';
import {projectAdminDeviceDetail} from '../src/lib/psAdminDevice';
import {setupProgress} from '../src/lib/psSetup';
import {en} from '../src/locales/en';
import {es} from '../src/locales/es';
import before from '../docs/evidence/pe600/before.json';
describe('PE-600 contract presentation',()=>{
 it.each([
  [null,true,'load_failed'],
  [{reason:null,update_available:true},false,'update_available'],
  [{reason:'newer_not_enabled',newer_blocked:{detail:'ring_disabled'}},false,'channel_restricted'],
  [{reason:'newer_not_enabled',newer_blocked:{detail:'canary_not_confirmed'}},false,'gated'],
  [{reason:'newer_incompatible'},false,'incompatible_newer'],
  [{reason:'up_to_date',newest_signed:{version:'0.3.27'}},false,'up_to_date'],
  [{reason:'up_to_date',newest_signed:null},false,'none_offered'],
  [{reason:'future_reason',update_available:true},false,'unknown'],
  [{reason:'newer_not_enabled',newer_blocked:{detail:'future_gate'}},false,'unknown'],
  [{reason:'newer_not_enabled',newer_blocked:null},false,'unknown'],
 ] as const)('classifies %j / load error %s as %s',(u,failed,state)=>expect(firmwareStatus(u,failed)).toBe(state));
 it('does not infer status from counts or merely newer_blocked',()=>{
  for(const editions_total of [0,1,99])for(const newer_blocked of [null,{detail:'ring_disabled'}]){
   const u={reason:'up_to_date',newest_signed:{version:'0.3.27'},editions_total,newer_blocked};
   expect(firmwareStatus(u)).toBe('up_to_date');expect(firmwareStatus({...u,newest_signed:null})).toBe('none_offered');
  }
 });
 it('preserves only the public signed-edition identity and does not enable unknown reasons',()=>{
  const update=before.contracts.ps_admin_device_detail.update;
  const raw={ok:true,device:{id:'d',serial:'PS-TEST',hostname:'test',model:'rpi4-2gb',arch:'arm64',status:'active'},update,delete:{allowed:false,blockers:[]}};
  const p=projectAdminDeviceDetail(raw);expect(p.update.newest_signed).toEqual({edition_id:update.newest_signed.edition_id,version:'0.3.27'});
  expect(p.update.can_update).toBe(false);
  expect(projectAdminDeviceDetail({...raw,update:{...update,reason:'future_reason',can_update:true,update_available:true}}).update.can_update).toBe(false);
 });
 it('never calls manual download/flash/boot done, even online and prepared',()=>{
  for(const preparation of ['not_started','code_issued','prepared','code_expired'] as const)for(const prepared of [false,true])for(const online of [false,true]){
   const result=setupProgress({preparation,prepared,online,ring:'lab'});
   expect(result.steps.filter(s=>['download','flash','boot'].includes(s.key)).map(s=>s.state)).toEqual(['manual','manual','manual']);
  }
 });
 it('all PE-600 strings are translated in EN and ES; capability fallback keeps the code',()=>{
  for(const key of Object.keys(en).filter(k=>k.startsWith('ps600.')||k==='psSetup.state.manual')){expect((en as any)[key]).toBeTruthy();expect((es as any)[key]).toBeTruthy();}
  expect(capabilityReason('legacy_device',k=>(en as any)[k]??k)).toContain('legacy');
  expect(capabilityReason('future_denial',k=>(en as any)[k]??k)).toContain('future_denial');
 });
});
