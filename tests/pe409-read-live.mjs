// PE-409.7: existing DEV fixtures, reads only; never creates a deployment/device job.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.LIVE_OUTPUT_DIR??'test-results/pe409';await mkdir(out,{recursive:true});
const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
const key=(await readFile('src/lib/config.ts','utf8')).match(/SUPABASE_PUBLIC_KEY\s*=\s*"([^"]+)"/)[1];
const root='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const tokens=[];
async function call(path,token,body={}) { const r=await fetch(root+path,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token??key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)}; }
async function login(profile) {const a=accounts[profile];assert(a,profile);const r=await call('/auth/v1/token?grant_type=password',null,{email:a.email,password:a.password});assert.equal(r.status,200);tokens.push(r.data.access_token);return r.data.access_token;}
const report={kind:'Existing DEV data; read-only user JWT calls',at:new Date().toISOString(),lists:[],checks:[]};
try {
 const admin=await login('staff_activo');
 const rpc=async(name,body={})=>{const r=await call('/rest/v1/rpc/'+name,admin,body);assert.equal(r.status,200,`${name}: ${r.status} ${r.data?.code}`);return r.data;};
 for(const kind of ['deployments','targets','audit','events']) {
   const name=`ps_ota_admin_${kind}_page`;let all=[],total,aggregates,pages=0,last=0;
   for(let offset=0;;offset+=50) {const p=await rpc(name,{p_limit:50,p_offset:offset});if(total===undefined){total=p.total;aggregates=p.aggregates;}assert.equal(p.total,total);assert.deepEqual(p.aggregates,aggregates);all.push(...p.items);pages++;last=p.items.length;if(offset+50>=total)break;}
   assert.equal(all.length,total);assert.equal(new Set(all.map(i=>String(i.id))).size,total);
   const field=kind==='targets'?'issued_at':'created_at';
   for(let i=1;i<all.length;i++){const newer=Date.parse(all[i-1][field]),older=Date.parse(all[i][field]);assert(newer>=older,`${kind} chronological`);if(newer===older){const x=String(all[i-1].id),y=String(all[i].id);assert(/^\d+$/.test(x)&&/^\d+$/.test(y)?BigInt(x)>BigInt(y):x>y,`${kind} ID descending tie-break`);}}
   const choice=kind==='audit'?all[0].action:kind==='deployments'?Object.keys(all[0].target_by_status)[0]:all[0].status;
   const byStatus=await rpc(name,{[kind==='audit'?'p_action':'p_status']:choice});
   const statusExpected=all.filter(x=>kind==='audit'?x.action===choice:kind==='deployments'?(x.target_by_status[choice]??0)>0:x.status===choice).length;assert.equal(byStatus.total,statusExpected);
   const day='2026-10-11',f={p_from:day+'T00:00:00Z',p_to:'2026-10-12T00:00:00Z'};
   const filtered=await rpc(name,{...f,p_limit:100});const expected=all.filter(x=>x[field]>=f.p_from&&x[field]<f.p_to).length;
   // Compare timestamps numerically (Postgres renders +00:00).
   const byDate=all.filter(x=>Date.parse(x[field])>=Date.parse(f.p_from)&&Date.parse(x[field])<Date.parse(f.p_to));assert.equal(filtered.total,byDate.length);
   const empty=await rpc(name,{p_query:'pe409-no-such-record-8846'});assert.equal(empty.total,0);
   const invalid=await call('/rest/v1/rpc/'+name,admin,{p_from:'2026-10-12',p_to:'2026-10-11'});assert.equal(invalid.data.code,'22023');
   report.lists.push({list:kind,total,pages,size:50,first:Math.min(50,total),last,day,filtered:filtered.total,empty:empty.total,invalid:invalid.data.code,aggregatesStable:true,stableIdOrder:true,statusFilter:{value:choice,total:byStatus.total}});
   if(kind==='audit')report.auditActions=[...new Set(all.map(x=>x.action))];
 }
 const overview=await rpc('ps_ota_admin_overview');report.legacyOverview=overview.deployments.length;
 for(const [label,name] of [['tenants','portal_tenant_directory'],['fleet','portal_ps_fleet'],['inventory','portal_ps_devices'],['firmwares','ps_firmware_list']]) {
  const d=await rpc(name);report.checks.push({label,shape:Array.isArray(d)?{rows:d.length}:Object.fromEntries(Object.entries(d).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]))});
 }
 report.checks.push({label:'overview-complete-arrays',releases:overview.releases.length,groups:overview.groups.length,devices:overview.devices.length});
 const owner=await login('owner_varios');
 for(const kind of ['deployments','targets','audit','events']) {const r=await call('/rest/v1/rpc/ps_ota_admin_'+kind+'_page',owner);assert.equal(r.data?.code,'42501');report.checks.push({label:`owner denied ${kind}`,status:r.status,code:r.data.code});}
 const directory=await rpc('portal_tenant_directory');let printer=null,venue=null;
 for(const v of directory){const panel=await rpc('ps_panel_state',{p_venue_id:v.id});if(panel?.printers?.length){for(const p of panel.printers){const q=await rpc('ps_panel_printer_jobs',{p_venue_id:v.id,p_printer_id:p.id,p_limit:1,p_offset:0});if(q.total>50){printer=p;venue=v;break;}}}if(printer)break;}
 if(printer){let all=[],total,pages=0,last=0;for(let offset=0;;offset+=50){const p=await rpc('ps_panel_printer_jobs',{p_venue_id:venue.id,p_printer_id:printer.id,p_limit:50,p_offset:offset});total=p.total;all.push(...p.jobs);pages++;last=p.jobs.length;if(offset+50>=total)break;}assert.equal(all.length,total);assert.equal(new Set(all.map(x=>x.id)).size,total);const f={p_venue_id:venue.id,p_printer_id:printer.id,p_from:'2026-10-11T00:00:00Z',p_to:'2026-10-12T00:00:00Z'};const filtered=await rpc('ps_panel_printer_jobs',f);assert.equal(filtered.total,all.filter(x=>Date.parse(x.created_at)>=Date.parse(f.p_from)&&Date.parse(x.created_at)<Date.parse(f.p_to)).length);report.lists.push({list:'printer queue',total,pages,size:50,first:Math.min(50,total),last,day:'2026-10-11',filtered:filtered.total});}
 const ownerAccess=await call('/rest/v1/rpc/portal_access',owner);const ownVenues=ownerAccess.data.owner_venues;
 assert(ownVenues.length>=2,'two venue fixture');
 for(const v of ownVenues.slice(0,2)){const r=await call('/rest/v1/rpc/ps_panel_state',owner,{p_venue_id:v.id});assert.equal(r.status,200);assert.equal(r.data.venue_id,v.id);report.checks.push({label:'owner permitted selected venue',http:r.status,venueMatches:true,printers:r.data.printers.length});}
 const other=directory.find(v=>!ownVenues.some(o=>o.id===v.id));assert(other);const denied=await call('/rest/v1/rpc/ps_panel_state',owner,{p_venue_id:other.id});assert.equal(denied.data.code,'42501');report.checks.push({label:'owner denied unowned venue',http:denied.status,code:denied.data.code});
 report.passed=true;
} finally {for(const token of tokens)await call('/auth/v1/logout?scope=local',token);await writeFile(out+'/reads.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
