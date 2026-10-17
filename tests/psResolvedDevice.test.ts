import {beforeEach,describe,it,expect,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../src/lib/supabase',()=>({supabase:{rpc}}));
import live from '../docs/evidence/pe469/live-contract.json';
import {projectResolvedDevice,getResolvedDevice,unlinkDevice} from '../src/lib/psResolvedDevice';
import {projectPsLink,prepareDevice,setDeviceLabel} from '../src/lib/psLink';
import {psErrorKey} from '../src/lib/printServerApi';
import {safeNext,destination} from '../src/lib/access';
import {projectVenueDevices} from '../src/lib/psVenueDevices';
const fresh=()=>structuredClone(live.resolved[0]) as any;
const answer=(data:unknown)=>rpc.mockResolvedValueOnce({data,error:null});
describe('PE-469 canonical device integration',()=>{
 beforeEach(()=>rpc.mockReset());
 it('accepts actual DEV fixture contract and maps historical runtime without changing inventory',()=>{
  for(const r of live.resolved)expect(projectResolvedDevice(r,r.requested_id).device_id).toBe(r.device_id);
  const r=fresh();expect(projectResolvedDevice({...r,requested_id:r.device_id},r.device_id).canonical_path).toContain(r.device_id);
 });
 it('rejects cross-device, runtime, venue and arbitrary canonical destinations',()=>{
  for(const mutate of [(r:any)=>r.link.device_id='other',(r:any)=>r.runtime.print_server_id='other',(r:any)=>r.venue.id='other',(r:any)=>r.canonical_path='https://evil.invalid',(r:any)=>r.requested_runtime.print_server_id='other']){
   const r=fresh();mutate(r);expect(()=>projectResolvedDevice(r,r.requested_id)).toThrow();
  }
 });
 it('retains old runtime resolution but uses the explicit current runtime',()=>{
  const r=fresh();r.runtime.print_server_id='current';r.link.print_server_id='current';r.requested_runtime.is_current=false;
  expect(projectResolvedDevice(r,r.requested_id).runtime?.print_server_id).toBe('current');
 });
 it('RPCs name canonical id and expected revision; rejects forbidden/stale and mismatched response',async()=>{
  const r=fresh();answer(r);await getResolvedDevice(r.requested_id);expect(rpc).toHaveBeenLastCalledWith('ps_device_resolve',{p_id:r.requested_id});
  answer({ok:true,already_unlinked:false,device_id:r.device_id,link:r.link});await unlinkDevice(r.device_id,10,'fixture');
  expect(rpc).toHaveBeenLastCalledWith('ps_admin_device_unlink',{p_device_id:r.device_id,p_expected_rev:10,p_reason:'fixture'});
  answer({ok:false,error:'forbidden',next_step:'ask_platform_admin'});const e=await unlinkDevice(r.device_id,10).catch(e=>e);expect(psErrorKey(e)).toBe('accessDenied');
  answer({ok:false,error:'stale_link_rev',next_step:'reload'});await expect(unlinkDevice(r.device_id,9)).rejects.toMatchObject({code:'stale_link_rev',nextStep:'reload'});
  answer({ok:true,device_id:'other',link:r.link});await expect(unlinkDevice(r.device_id,10)).rejects.toMatchObject({code:'accessDenied'});
 });
 it('code/name responses from another PS never update selected PS',async()=>{
  const r=fresh();answer({ok:true,device_id:'other',enrollment_code:'synthetic'});await expect(prepareDevice(r.device_id)).rejects.toMatchObject({code:'accessDenied'});
  answer({ok:true,link:{...r.link,device_id:'other'}});await expect(setDeviceLabel(r.device_id,'test')).rejects.toMatchObject({code:'accessDenied'});
 });
 it('never upgrades online/config response to sync; old ACK does not confirm',()=>{
  const r=fresh();r.runtime.online=true;
  expect(projectResolvedDevice(r,r.requested_id).link.sync?.confirmed).toBe(false);
  r.link.state='sincronizado';r.link.sync.confirmed=true;r.link.sync.ack_at=new Date().toISOString();r.link.sync.ack_rev=9;
  expect(projectPsLink(r.link)).toMatchObject({state:'asignado_pendiente_sync',sync:{confirmed:false}});
  r.link.sync.ack_rev=10;expect(projectPsLink(r.link)?.sync?.confirmed).toBe(true);
  r.link.rev=null;r.link.venue_id=null;r.link.sync.scope='unlinked';expect(projectPsLink(r.link)?.sync?.confirmed).toBe(true);
 });
 it('venue list uses inventory identity and rejects a foreign linked device',()=>{
  const r=fresh(),d={id:r.runtime.print_server_id,inventory_device_id:null,print_server_id:r.runtime.print_server_id,link:r.link};
  expect(projectVenueDevices({venue_id:r.venue.id,devices:[d]},r.venue.id).devices[0].id).toBe(r.device_id);
  expect(()=>projectVenueDevices({venue_id:'foreign',devices:[d]},'foreign')).toThrow();
 });
 it('retains canonical PS and selected venue through login, rejecting secret/foreign redirect parameters',()=>{
  const r=fresh();const paths=[`${r.canonical_path}?fromVenue=${r.venue.id}`,`/admin/tenants/${r.venue.id}/print-servers?selected=${r.device_id}`,`/admin/print-servers/inventory?fromVenue=${r.venue.id}`,`/?venue=${r.venue.id}&section=print-servers&device=${r.device_id}`];
  for(const p of paths)expect(safeNext(p)).toBe(p);
  for(const p of [`${r.canonical_path}?code=pse_secret`,`${r.canonical_path}?fromVenue=${r.venue.id}&fromVenue=${r.venue.id}`,`${r.canonical_path}?return=https://evil.invalid`,`${r.canonical_path}?fromVenue=garbage`])expect(safeNext(p)).toBeNull();
  expect(destination({is_platform_staff:true,can_manage_staff:false,can_view_tenants:true,owner_venues:[],platform_role:'operations'},paths[0])).toBe('/admin');
 });
});
