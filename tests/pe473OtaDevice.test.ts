// PE-474 supersedes PE-473 validation and group-based channel control.
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:mocks.rpc,auth:{getSession:mocks.getSession}}}));
import {projectAdminDeviceDetail,setAdminDeviceChannel,setPrintServerChannel,updateAdminDevice} from '../src/lib/psAdminDevice';
import {channelSelectionValid,defaultEditionId,projectAdminOtaExtras,showValidateButton} from '../src/lib/psOtaDevice';
import {deviceSheet,deviceUpdate} from './fixtures/pe474';
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
beforeEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();mocks.getSession.mockResolvedValue({data:{session:{access_token:'synthetic'}}});});
describe('PE474 channel and installable selector, isolated responses',()=>{
 it('consumes channel revision and deployment groups independently, without PE473 requirements',()=>{
  const raw={...deviceUpdate(),canary_validation:{can_validate:true},general_requirements:{eligible:false}};
  const p=projectAdminDeviceDetail(deviceSheet(raw));
  expect(p.update.can_update).toBe(true);expect(p.update.ota.channel).toMatchObject({ring:'general',revision:3});
  expect(p.update.ota.canary).toBeNull();expect(p.update.ota.general).toBeNull();expect(showValidateButton({can_validate:true} as never)).toBe(false);
  expect(defaultEditionId(p.update.ota.editions)).toBe('edition');
  expect(p.update.ota.editions?.[0]).toMatchObject({sha256_short:'a'.repeat(12),selectable:true,installed:false});
 });
 it.each(['up_to_date','newer_not_enabled','newer_incompatible'])('empty selector preserves exact server reason %s',reason=>{
  const p=projectAdminDeviceDetail(deviceSheet({...deviceUpdate(),editions:[],editions_total:0,candidate:null,can_update:false,update_available:false,reason,newer_blocked:reason==='up_to_date'?null:{version:'0.3.24',detail:reason==='newer_incompatible'?'incompatible_device':'ring_disabled',channel:'lab'}}));
  expect(p.update.reason).toBe(reason);expect(p.update.ota.editions).toEqual([]);expect(p.update.can_update).toBe(false);
 });
 it('honors the limit 20 and total without requesting extra editions or disabled catalog entries',()=>{
  const base=deviceUpdate();const editions=Array.from({length:20},(_,i)=>({...base.editions[0],edition_id:`edition-${i}`,version:`1.0.${100-i}`}));
  const p=projectAdminOtaExtras({...base,editions,editions_total:2000});expect(p.editions).toHaveLength(20);expect(p.editions_total).toBe(2000);
  expect(projectAdminOtaExtras({...base,editions:[...editions,base.editions[0]],editions_total:2000}).editions).toBeNull();
  expect(projectAdminOtaExtras({...base,editions_limit:undefined}).editions).toBeNull();
  expect(projectAdminOtaExtras({...base,editions:[{...base.editions[0],sha256_short:'malformed'}]}).editions).toBeNull();
 });
 it('missing metadata and obsolete channel options never grant actions',()=>{
  const p=projectAdminDeviceDetail(deviceSheet({...deviceUpdate(),channel:{ring:'general',can_change:true,options:[{ring:'lab'}]}}));
  expect(p.update.can_update).toBe(false);expect(p.update.ota.channel).toBeNull();
  const ch=projectAdminOtaExtras(deviceUpdate()).channel!;expect(channelSelectionValid(ch,'lab')).toBe(true);expect(channelSelectionValid(ch,'general')).toBe(false);
 });
 it('set_channel sends expected channel/revision, never group_id or OTA',async()=>{
  const fetch=vi.fn().mockImplementation(async()=>response({ok:true,changed:true}));vi.stubGlobal('fetch',fetch);
  await setAdminDeviceChannel('device','canary','lab',7);
  await setPrintServerChannel('ps','general','canary',8);
  expect(fetch.mock.calls.map(c=>JSON.parse(c[1].body))).toEqual([
    {action:'set_channel',device_id:'device',channel:'canary',expected_channel:'lab',expected_revision:7},
    {action:'set_channel',print_server_id:'ps',channel:'general',expected_channel:'canary',expected_revision:8}]);
 });
 it('backend concurrency refusal remains an error; no retry/write fallback',async()=>{
  const fetch=vi.fn().mockResolvedValue(response({ok:false,error:'channel_changed',channel:'general',revision:8},409));vi.stubGlobal('fetch',fetch);
  await expect(setAdminDeviceChannel('device','canary','lab',7)).rejects.toMatchObject({key:'adminDevice.error.channel_changed'});expect(fetch).toHaveBeenCalledTimes(1);
  await expect(setAdminDeviceChannel('device','canary','lab',-1)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('update accepts an installable non-candidate option and rechecks snapshot',async()=>{
  const u=deviceUpdate();u.editions.push({...u.editions[0],edition_id:'other',version:'0.3.11'});u.editions_total=2;
  mocks.rpc.mockResolvedValue({data:deviceSheet(u)});const fetch=vi.fn().mockImplementation(async()=>response({ok:true,deployment_id:'fixture'}));vi.stubGlobal('fetch',fetch);
  await updateAdminDevice('device','other','0.3.9');expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({action:'update_device',device_id:'device',edition_id:'other',expected_installed_version:'0.3.9'});
  await expect(updateAdminDevice('device','installed-or-old','0.3.9')).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(response({ok:false,error:'edition_not_installable'},409));await expect(updateAdminDevice('device','other','0.3.9')).rejects.toMatchObject({key:'adminDevice.error.edition_not_installable'});
 });
 it('owner cannot change channels and failed reads cannot authorize an update',async()=>{
  const fetch=vi.fn().mockResolvedValue(response({code:'42501'},403));vi.stubGlobal('fetch',fetch);
  await expect(setAdminDeviceChannel('device','lab','general',0)).rejects.toMatchObject({code:'accessDenied'});
  mocks.rpc.mockResolvedValue({error:{code:'XX000'}});await expect(updateAdminDevice('device','edition','0.3.9')).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('active UI has no validation writes or general requirement controls',()=>{
  const ui=readFileSync('src/components/DeviceAdminSummary.tsx','utf8');expect(ui).not.toMatch(/validateAdminDevice|ValidateDialog|GeneralRequirementsBlock|CanaryValidationBlock/);
  const owner=readFileSync('src/components/PrintServerOtaBlock.tsx','utf8');expect(owner).not.toMatch(/DeviceOtaBlocks|DeviceAdminSummary|sha256|setAdminDeviceChannel/);
 });
});
