// Synthetic fixtures only: every backend request is answered in-process by an
// in-memory fake, and anything else leaving the local origin is aborted. This
// verifies the browser behaviour of /admin/print-servers, NOT live DEV permissions.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
const out=(process.env.SMOKE_OUTPUT_DIR??new URL('../test-results/smoke/',import.meta.url).pathname).replace(/\/?$/, '/');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const records=[],errors=[];
const uid='11111111-1111-4111-8111-111111111111',v1='22222222-2222-4222-8222-222222222222',v2='33333333-3333-4333-8333-333333333333',v3='55555555-5555-4555-8555-555555555555';
const p1='66666666-6666-4666-8666-666666666661',p2='66666666-6666-4666-8666-666666666662',NEW_MAC='11:22:33:44:55:66',CODE='SMOKE-CODE-1234';
const user={id:uid,email:'portal-test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T10:00:00Z'};
function session(seconds=3600){const exp=Math.floor(Date.now()/1000)+seconds,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return {access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic-not-valid`,refresh_token:'synthetic-not-valid',expires_in:seconds,expires_at:exp,token_type:'bearer',user};}
const iso=ms=>new Date(Date.now()-ms).toISOString();
function backend(){
 const junk={credential_hash:'HASH-SHOULD-NEVER-SHOW',enrollment_code_hash:'HASH-SHOULD-NEVER-SHOW'};
 const db={server:{id:'44444444-4444-4444-8444-444444444441',label:'Front desk',status:'active',device_id:'dev-1',hostname:'mini-pc',software_version:'2.4.1',local_address:'192.168.1.10',local_port:8443,enrolled_at:iso(9e8),last_seen_at:iso(30000),last_status_at:iso(30000),last_status:{uptime_seconds:93784,queue_depth:7,portal_url:'https://portal.example.invalid',note:'all good'},channel_opened_at:iso(3.6e6),online:true,ca_cert_available:true,ca_cert_fingerprint:'AB:CD:EF:01',ca_cert_updated_at:iso(9e8),...junk},
  pending:null,polls:0,calls:[],seen:[],jobCalls:[],
  // Queue fixtures: 23 jobs on the first printer (three pages of 10), none on the second.
  jobs:{[p1]:Array.from({length:23},(_,i)=>({id:`77777777-7777-4777-8777-${String(i).padStart(12,'0')}`,status:i===0?'pending':i===1?'cancelled':i===2?'failed':'sent',source_type:i%3===0?'test':i%3===1?'receipt':'kitchen_ticket',print_route:'ps',attempts:i===0?0:i===2?3:1,created_at:iso(60000*(i+1)),started_at:null,completed_at:i===0?null:iso(60000*(i+1)-5000),error_code:i===1?'print_server_replaced':i===2?'weird_device_code':null,attempt_error_code:null,payload_text:'PAYLOAD-SHOULD-NEVER-SHOW',job_token:'TOKEN-SHOULD-NEVER-SHOW'})),[p2]:[]},
  printers:[{id:p1,label:'Bar',location:'Bar',model:'TM-T20',mac_address:'AA:BB:CC:DD:EE:01',paper_width_chars:42,is_active:true,print_route:'print_server',last_seen_at:null,last_error:null,last_report:{reachable:true,local_address:'192.168.1.50',model:'TM-T20',state:'ready',error:null,reported_at:iso(60000)},last_report_at:iso(60000),pending_jobs:2,workstations:[{id:'w1',name:'Caja 1'}],created_at:null},
   {id:p2,label:'Kitchen',location:null,model:null,mac_address:'AA:BB:CC:DD:EE:02',paper_width_chars:42,is_active:false,print_route:'print_server',last_seen_at:null,last_error:'paper out',last_report:null,last_report_at:null,pending_jobs:0,workstations:[],created_at:null}]};
 const fleet=()=>[{venue_id:v1,venue_name:'Sample Harbor',venue_slug:'sample-harbor',venue_is_active:true,print_server:db.server,pending_enrollment:db.pending,revoked_count:0,last_revoked_at:null,printers_total:db.printers.length,printers_active:db.printers.filter(p=>p.is_active).length,printers_paused:db.printers.filter(p=>!p.is_active).length,printers_with_error:db.printers.filter(p=>p.last_error).length,pending_jobs:db.printers.reduce((n,p)=>n+p.pending_jobs,0),...junk},
  {venue_id:v2,venue_name:'Sample Garden',venue_slug:'sample-garden',venue_is_active:false,print_server:{...db.server,id:'44444444-4444-4444-8444-444444444442',software_version:'2.3.0',online:false,last_seen_at:iso(3*864e5),last_status:null},pending_enrollment:null,revoked_count:1,last_revoked_at:null,printers_total:0,printers_active:0,printers_paused:0,printers_with_error:0,pending_jobs:0},
  {venue_id:v3,venue_name:'Sample Tower',venue_slug:'sample-tower',venue_is_active:true,print_server:null,pending_enrollment:null,revoked_count:0,last_revoked_at:null,printers_total:0,printers_active:0,printers_paused:0,printers_with_error:0,pending_jobs:0}];
 const rpc=(name,a)=>{
  if(name==='ps_panel_printer_jobs'){db.jobCalls.push(a);if(a.p_venue_id!==v1||!(a.p_printer_id in db.jobs))return {ok:false,error:'printer_not_found'};const all=db.jobs[a.p_printer_id];return {ok:true,venue_id:a.p_venue_id,printer_id:a.p_printer_id,limit:a.p_limit,offset:a.p_offset,total:all.length,jobs:all.slice(a.p_offset,a.p_offset+a.p_limit)};}
  if(name!=='ps_panel_state'&&name!=='portal_ps_fleet'&&name!=='ps_panel_command')db.calls.push([name,a]);
  const printer=db.printers.find(p=>p.id===a.p_printer_id);
  switch(name){
   case 'portal_ps_fleet':return fleet();
   case 'ps_panel_state':return a.p_venue_id===v1?{venue_id:v1,can_manage:true,server_time:iso(0),print_server:db.server,pending_enrollment:db.pending,printers:db.printers,last_scan:null,...junk}:{venue_id:a.p_venue_id,can_manage:true,server_time:iso(0),print_server:null,pending_enrollment:null,printers:[],last_scan:null};
   case 'ps_panel_create_enrollment':db.pending={id:'e1',label:a.p_label,expires_at:new Date(Date.now()+3.6e6).toISOString(),created_at:iso(0)};return {ok:true,print_server_id:'new',venue_id:a.p_venue_id,enrollment_code:CODE,expires_at:db.pending.expires_at};
   case 'ps_panel_revoke':db.server=null;return {ok:true,print_server_id:a.p_print_server_id,jobs_cancelled:2};
   case 'ps_panel_ca_cert':return {ok:true,ca_cert_pem:'-----BEGIN CERTIFICATE-----\nMIIBsmoke\n-----END CERTIFICATE-----\n',ca_cert_fingerprint:'AB:CD:EF:01',ca_cert_updated_at:iso(9e8),filename:'sample-harbor-ca.pem'};
   case 'ps_panel_request_scan':db.polls=0;return {ok:true,already:false,command_id:'c1',status:'pending',expires_at:null,ps_online:true};
   case 'ps_panel_command':return ++db.polls<2?{ok:true,command_id:'c1',status:'pending',result:null,error_code:null,error_detail:null}:{ok:true,command_id:'c1',status:'done',error_code:null,error_detail:null,result:{count:2,scanned_at:iso(0),network:'192.168.1.0/24',candidates:[{mac_address:'AA:BB:CC:DD:EE:01',local_address:'192.168.1.50',model:'TM-T20',hostname:null,port:9100,reachable:true,printer_id:p1},{mac_address:NEW_MAC,local_address:'192.168.1.60',model:null,hostname:null,port:9100,reachable:true,printer_id:null}]}};
   case 'ps_panel_add_printer':if(db.printers.some(p=>p.label===a.p_label))return {ok:false,error:'label_already_used'};db.printers.push({id:'66666666-6666-4666-8666-666666666663',label:a.p_label,location:a.p_location,model:a.p_model,mac_address:a.p_mac_address,paper_width_chars:42,is_active:true,print_route:'print_server',last_seen_at:null,last_error:null,last_report:null,last_report_at:null,pending_jobs:0,workstations:[],created_at:null});return {ok:true,printer:{id:'66666666-6666-4666-8666-666666666663',label:a.p_label}};
   case 'ps_panel_update_printer':printer.label=a.p_label;return {ok:true};
   case 'ps_panel_set_printer_active':printer.is_active=a.p_active;return {ok:true};
   case 'ps_panel_test_print':db.jobs[a.p_printer_id]?.unshift({id:'77777777-7777-4777-8777-999999999999',status:'pending',source_type:'test',print_route:'ps',attempts:0,created_at:iso(0),started_at:null,completed_at:null,error_code:null,attempt_error_code:null});return {ok:true,job_id:'j1'};
   case 'ps_panel_remove_printer':if(!a.p_force&&printer.workstations.length)return {ok:false,error:'printer_in_use',workstations:printer.workstations,pending_jobs:printer.pending_jobs};db.printers=db.printers.filter(p=>p!==printer);return {ok:true};
  }
  throw new Error('Unexpected fixture RPC '+name);
 };
 return {db,rpc};
}
async function setup({role='super_admin',width=1440}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000},locale:'en',acceptDownloads:true}),fake=backend();
 await ctx.addInitScript(s=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));sessionStorage.setItem('seeded','1');}},session());
 // Nothing but the local test origin is ever reached.
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const req=route.request(),url=new URL(req.url());
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname==='/auth/v1/token')return send(session());
  if(url.pathname==='/auth/v1/user')return send(user);
  if(url.pathname==='/rest/v1/staff_profiles')return send(null);
  if(url.pathname.endsWith('/rpc/is_platform_staff'))return send(true);
  if(url.pathname.endsWith('/rpc/portal_access'))return send({is_platform_staff:role==='super_admin',platform_role:role,owner_venues:[]});
  if(url.pathname.endsWith('/rpc/portal_tenant_directory'))return send([]);
  if(url.pathname.includes('/rest/v1/rpc/')){
   fake.db.seen.push(url.pathname.split('/').pop());
   if(role!=='super_admin')return send({code:'42501',message:'denied'},403);
   return send(fake.rpc(url.pathname.split('/').pop(),req.postDataJSON()??{}));
  }
  return route.abort();
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));return {ctx,page,...fake};
}
const record=name=>{records.push(name);console.log('PASS '+name);};
// Focused PE-332 acceptance. All backend calls are synthetic, including on DEV.
try {
 for (const width of [1440,390]) {
  const {ctx,page,db}=await setup({width});
  for(let i=3;i<=12;i++) {
   const id=`66666666-6666-4666-8666-${String(i).padStart(12,'0')}`;
   db.printers.push({...db.printers[0],id,label:i===3?'Impresora con nombre muy largo para cocina y preparación de pedidos '+ 'X'.repeat(80):`Printer ${i}`,pending_jobs:i,last_error:i===3?'Aviso '+ 'W'.repeat(140):null,last_report:i===4?{...db.printers[0].last_report,error:'Paper jam'}:null,last_report_at:null});
   db.jobs[id]=[];
  }
  await page.goto(origin+`/admin/print-servers/${v1}?lang=es`);
  await page.getByTestId('ps-state').waitFor();
  await page.getByRole('button',{name:'ES',exact:true}).click();
  const queues=page.locator('.ps-queue');
  const toggles=queues.locator('button[aria-expanded]');
  await toggles.first().waitFor();
  assert.equal(await toggles.count(),12);
  assert.deepEqual(await toggles.evaluateAll(es=>es.map(e=>e.getAttribute('aria-expanded'))),Array(12).fill('false'));
  for(let i=0;i<12;i++) {
   const toggle=toggles.nth(i), text=await toggle.innerText();
   assert(text.includes(db.printers[i].label));
   assert(text.includes(String(db.printers[i].pending_jobs)));
   assert(text.includes(i===1?'En pausa':'Activa'));
   const panel=page.locator('[id="'+await toggle.getAttribute('aria-controls')+'"]');
   assert.equal(await panel.count(),1);assert(!(await panel.isVisible()));
  }
  assert((await toggles.first().innerText()).includes('Sin aviso disponible'));
  assert((await toggles.nth(1).innerText()).includes('Nunca'));
  assert((await toggles.first().locator('.ps-queue-report-date').innerText()).includes(String(new Date().getFullYear())));
  assert((await toggles.nth(1).innerText()).includes('paper out'));
  assert((await toggles.nth(3).innerText()).includes('Paper jam'));
  await page.getByTestId('ps-jobs').screenshot({path:out+`queues-closed-${width}.png`});
  record(`${width}px: 12 queues initially closed with printer summaries`);
  const q1=page.getByTestId(`queue-${p1}`), q2=page.getByTestId(`queue-${p2}`);
  const a=q1.locator('button[aria-expanded]'),b=q2.locator('button[aria-expanded]');
  await page.keyboard.press('Tab');await a.focus();assert.notEqual(await a.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
  await page.keyboard.press('Enter');assert.equal(await a.getAttribute('aria-expanded'),'true');
  assert.equal(await b.getAttribute('aria-expanded'),'false');
  await b.click();assert.equal(await a.getAttribute('aria-expanded'),'true');
  await page.getByTestId(`queue-empty-${p2}`).waitFor();
  await a.focus();await page.keyboard.press('Space');assert.equal(await a.getAttribute('aria-expanded'),'false');
  assert.equal(await b.getAttribute('aria-expanded'),'true');
  await a.click();
  await q1.locator('[data-testid^="job-row-"]').first().waitFor();
  await page.getByTestId(`queue-next-${p1}`).click();
  await page.getByTestId(`queue-page-${p1}`).getByText('Página 2 de 3',{exact:true}).waitFor();
  assert.equal(await a.getAttribute('aria-expanded'),'true');
  await a.click();await a.click();
  assert.equal(await page.getByTestId(`queue-page-${p1}`).innerText(),'Página 2 de 3');
  const before=db.jobCalls.length;
  await page.getByTestId(`queue-refresh-${p1}`).click();
  await page.locator(`[data-testid="queue-${p1}"][data-loading="false"]`).waitFor();
  assert.equal(db.jobCalls.length,before+1);assert.equal(db.jobCalls.at(-1).p_offset,10);
  assert.equal(await a.getAttribute('aria-expanded'),'true');
  await page.getByTestId(`queue-prev-${p1}`).click();
  await page.getByTestId(`queue-page-${p1}`).getByText('Página 1 de 3',{exact:true}).waitFor();
  assert(db.jobCalls.every(c=>c.p_venue_id===v1&&c.p_limit===10));
  assert.equal(await q1.locator('[data-testid^="job-row-"]').count(),10);
  assert(!(await page.content()).includes('SHOULD-NEVER-SHOW'));
  record(`${width}px: independent click/Enter/Space, visible focus, inner buttons preserve expansion, pagination/refresh/empty preserved`);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page horizontal overflow');
  assert(await queues.evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)),'queue horizontal overflow');
  await page.getByTestId('ps-jobs').screenshot({path:out+`queues-open-${width}.png`});
  record(`${width}px: no horizontal overflow with 12 printers and long names/notices`);
  await page.reload();await toggles.first().waitFor();
  assert.deepEqual(await toggles.evaluateAll(es=>es.map(e=>e.getAttribute('aria-expanded'))),Array(12).fill('false'));
  await ctx.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'collapsible-queues.json',JSON.stringify({origin,backend:'synthetic intercepted API responses; not a live authorization test',checks:records,pageErrors:errors,passed:true},null,2));
} finally {await browser.close();}
