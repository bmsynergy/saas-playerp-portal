import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {login,api} from './helpers/pe600-readonly.mjs';
const key=(await readFile('build/dev-defaults.ts','utf8')).match(/SUPABASE_PUBLIC_KEY = "([^"]+)/)[1];
const fixture='72e06b4f-a63e-49e9-bd06-f02b8a9186a1',beny='34fd3ff8-f558-4d39-a805-834264d8f6bc',sessions=[];
async function rpc(s,name,id){const r=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_device_id:id})});return {http:r.status,data:await r.json()};}
const report={at:new Date().toISOString(),environment:api,fixture,permissions:[],hardware:'not validated'};
try{
 const admin=await login();sessions.push(admin);
 for(const [name,id] of [['fixture',fixture],['beny',beny]]){
  const {data:d}=await rpc(admin,'ps_admin_stock_status',id);assert.equal(d.ok,true);assert.equal(d.stock.state,'file_issued');assert.equal(d.stock.label_ready,false);assert.equal(d.venue_id,null);
  report[name]={id,serial:d.serial,state:d.stock.state,label_ready:d.stock.label_ready,venue_id:d.venue_id,file:d.stock.file};
 }
 assert(report.beny.file.sha256.startsWith('2ef0885f')&&report.beny.file.sha256.endsWith('7a27'));assert.equal(report.beny.file.superseded_at,null);assert.equal(report.beny.file.consumed_by_device,false);
 const first=(await rpc(admin,'ps_admin_stock_reserved_credentials',fixture)).data,second=(await rpc(admin,'ps_admin_stock_reserved_credentials',fixture)).data;
 assert.equal(first.ok,true);assert.equal(first.status,'reserved_pending_confirmation');assert.deepEqual(first.reserved,second.reserved);assert.deepEqual(first.file,second.file);assert.equal(first.label_ready,false);assert.equal(first.confirmed_at,null);assert(!/pse_|pst_|PRIVATE KEY/.test(JSON.stringify(first)));
 report.reservations={status:first.status,confirmed_at:first.confirmed_at,label_ready:first.label_ready,repeatMatches:true,technicalSecretsAbsent:true};
 const label=(await rpc(admin,'ps_admin_stock_label',fixture)).data;assert.equal(label.error,'device_not_confirmed');report.labelDenied=label.error;
 for(const role of ['owner_varios','venue_frontdesk']){
  const s=await login(role);sessions.push(s);
  for(const name of ['ps_admin_stock_reserved_credentials','ps_admin_stock_status','ps_admin_stock_label']){
   const r=await rpc(s,name,fixture);assert.equal(r.data.error,'forbidden');assert(!r.data.reserved);report.permissions.push({role,rpc:name,http:r.http,error:r.data.error});
  }
 }
 const r=await fetch(api+'/functions/v1/ps-firmware-admin',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+admin.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'kit_list'})}),kits=await r.json();
 const all=Array.isArray(kits)?kits:kits.items??kits.kits;assert(Array.isArray(all),'kit list shape');
 const image=all.find(x=>x.id==='b1cb8a2f-53bf-48c0-9df4-e43516bd5917');assert(image);assert.equal(image.sha256,'e4f702c8d57c656e1e6195bfcc45fbc889f1192c12da6dbf85dd3074d4381e0e');
 report.image={id:image.id,file_name:image.file_name,sha256:image.sha256,bytes:image.bytes,release_id:image.release_id,profile:image.profile};report.pass=true;
}finally{
 for(const s of sessions)await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+s.access_token}});
 await writeFile('docs/evidence/pe6015/contract.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
