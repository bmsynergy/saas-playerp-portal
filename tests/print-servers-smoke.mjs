// Synthetic fixtures only: every backend request is answered in-process by an
// in-memory fake, and anything else leaving the local origin is aborted. This
// verifies the browser behaviour of /admin/print-servers, NOT live DEV permissions.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {X509Certificate,createHash} from 'node:crypto';
const pem=await readFile(new URL('./fixtures/certificate-ca.pem',import.meta.url),'utf8');
const fingerprint=createHash('sha256').update(new X509Certificate(pem).raw).digest('hex');
const shownFingerprint=fingerprint.toUpperCase().match(/../g).join(':');
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
 const db={server:{id:'44444444-4444-4444-8444-444444444441',label:'Front desk',status:'active',device_id:'dev-1',hostname:'mini-pc',software_version:'2.4.1',local_address:'192.168.1.10',local_port:8443,enrolled_at:iso(9e8),last_seen_at:iso(30000),last_status_at:iso(30000),last_status:{uptime_seconds:93784,queue_depth:7,portal_url:'https://portal.example.invalid',note:'all good'},channel_opened_at:iso(3.6e6),online:true,ca_cert_available:true,ca_cert_status:'reported',ca_cert_der_sha256:fingerprint,ca_cert_fingerprint:'AB:CD:EF:01',ca_cert_updated_at:iso(9e8),...junk},
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
   case 'ps_panel_ca_cert':return {ok:true,ca_cert_pem:pem,ca_cert_status:'reported',ca_cert_der_sha256:fingerprint,ca_cert_fingerprint:'AB:CD:EF:01',ca_cert_updated_at:iso(9e8),filename:'sample-harbor-ca.pem'};
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
try{
 {
  const {ctx,page}=await setup();const id=x=>page.getByTestId(x),rows=()=>page.locator('[data-testid^="fleet-row-"]').count();
  await page.goto(origin+'/admin/print-servers/list');await id(`fleet-row-${v1}`).waitFor();
  assert.equal(await id('fleet-count').innerText(),'3 of 3');
  await page.locator('.sidebar-nav').getByRole('link',{name:'Print Servers',exact:true}).waitFor();
  await id('fleet-filter-search').fill('garden');assert.equal(await rows(),1);assert.equal(await id('fleet-count').innerText(),'1 of 3');await id('fleet-filter-clear').click();
  for(const [filter,value,expected] of [['venue',v3,[v3]],['version','2.3.0',[v2]],['version','__none__',[v3]],['signal','3m',[v1]],['signal','older',[v2]],['signal','never',[v3]],['state','online',[v1]],['state','offline',[v2]],['state','none',[v3]],['printers','with',[v1]],['printers','without',[v2,v3]],['printers','paused',[v1]],['printers','error',[v1]]]){
   await id(`fleet-filter-${filter}`).selectOption(value);assert.equal(await rows(),expected.length,`${filter}=${value}`);for(const v of expected)await id(`fleet-row-${v}`).waitFor();
   await id('fleet-filter-clear').click();assert.equal(await rows(),3);
  }
  assert(!(await page.content()).includes('HASH-SHOULD-NEVER-SHOW'));
  await page.screenshot({path:out+'print-servers-fleet.png',fullPage:true});
  record('Fleet list: every filter reduces the list and clears');
  await id(`fleet-open-${v1}`).click();await page.waitForURL(`**/admin/print-servers/${v1}`);await id('ps-state').waitFor();await ctx.close();
 }
 {
  const {ctx,page,db}=await setup();const id=x=>page.getByTestId(x),result=text=>page.locator('[data-testid="action-result"]',{hasText:text}).waitFor();
  const confirm=async text=>{await id('confirm-dialog').waitFor();const body=await id('confirm-dialog').innerText();assert(body.includes('Sample Harbor'),'confirmation names the venue');if(text)assert(body.includes(text),`confirmation says: ${text}`);await id('confirm-accept').click();};
  await page.goto(origin+`/admin/print-servers/${v1}`);await page.getByRole('heading',{name:'Sample Harbor',exact:true}).waitFor();
  assert.equal(await id('ps-state').innerText(),'Online');assert.equal(await id('ps-version').innerText(),'2.4.1');assert.equal(await id('ps-queue-depth').innerText(),'7');assert.equal(await id('ps-pending-jobs').innerText(),'2');assert.equal(await id('ps-cert-fingerprint').innerText(),shownFingerprint);
  record('Detail: card, diagnostics and certificate fingerprint');
  {
   // Print queue per printer: five columns, pagination, manual refresh and the empty state.
   const queue=id(`queue-${p1}`),settled=()=>page.locator(`[data-testid="queue-${p1}"][data-loading="false"]`).waitFor(),jobRows=()=>queue.locator('[data-testid^="job-row-"]');
   await settled();await queue.locator("button[aria-expanded]").click();await jobRows().first().waitFor();
   assert.deepEqual(await queue.locator('thead th').allInnerTexts().then(h=>h.map(x=>x.trim().toLowerCase())),['status','date','source','attempts','error']);
   assert.equal(await jobRows().count(),10);assert.equal(await id(`queue-total-${p1}`).innerText(),'23 jobs');assert.equal(await id(`queue-page-${p1}`).innerText(),'Page 1 of 3');assert(await id(`queue-prev-${p1}`).isDisabled());
   const first=(await jobRows().nth(0).innerText()).replace(/\s+/g,' ');for(const piece of ['Queued','Test print','0','No error'])assert(first.includes(piece),`first job shows ${piece}: ${first}`);
   assert((await jobRows().nth(1).innerText()).includes('the Print Server was replaced'),'known error code has its message');
   assert((await jobRows().nth(2).innerText()).includes('Print Server error (code: weird_device_code)'),'unknown code is shown as a code');
   const firstId=await jobRows().nth(0).getAttribute('data-testid');
   await id(`queue-next-${p1}`).click();await id(`queue-page-${p1}`).getByText('Page 2 of 3',{exact:true}).waitFor();await settled();assert.equal(await jobRows().count(),10);assert.notEqual(await jobRows().nth(0).getAttribute('data-testid'),firstId);
   await id(`queue-next-${p1}`).click();await id(`queue-page-${p1}`).getByText('Page 3 of 3',{exact:true}).waitFor();await settled();assert.equal(await jobRows().count(),3);assert(await id(`queue-next-${p1}`).isDisabled());
   await id(`queue-prev-${p1}`).click();await id(`queue-page-${p1}`).getByText('Page 2 of 3',{exact:true}).waitFor();await id(`queue-prev-${p1}`).click();await id(`queue-page-${p1}`).getByText('Page 1 of 3',{exact:true}).waitFor();await settled();
   assert.deepEqual(db.jobCalls.filter(c=>c.p_printer_id===p1).map(c=>c.p_offset),[0,10,20,10,0]);assert(db.jobCalls.every(c=>c.p_venue_id===v1&&c.p_limit===10));
   record('Queue: state, date, source, attempts and error; previous/next across three pages');
   db.jobs[p1].unshift({id:'77777777-7777-4777-8777-888888888888',status:'printing',source_type:'receipt',print_route:'ps',attempts:1,created_at:iso(0),started_at:iso(0),completed_at:null,error_code:null,attempt_error_code:null});
   const before=db.jobCalls.length;await id(`queue-refresh-${p1}`).click();await id('job-row-77777777-7777-4777-8777-888888888888').waitFor();assert.equal(db.jobCalls.length,before+1);assert.deepEqual(db.jobCalls.at(-1),{p_venue_id:v1,p_printer_id:p1,p_limit:10,p_offset:0});assert.equal(await id(`queue-total-${p1}`).innerText(),'24 jobs');
   record('Queue: refresh asks again and shows the new job');
   await id(`queue-${p2}`).locator('button[aria-expanded]').click();await id(`queue-empty-${p2}`).getByText('Empty queue',{exact:true}).waitFor();assert.equal(await id(`queue-${p2}`).locator('[data-testid^="job-row-"]').count(),0);assert.equal(await id(`queue-total-${p2}`).innerText(),'0 jobs');
   assert.equal(await id(`queue-prev-${p2}`).count(),0);assert(db.jobCalls.some(c=>c.p_printer_id===p2));
   record('Queue: a printer without jobs shows the empty queue message');
   assert(!(await page.content()).includes('SHOULD-NEVER-SHOW'));await queue.screenshot({path:out+'print-servers-queue.png'});
  }
  // Printer details are collapsed initially in both scopes.
  await id('printers-toggle').click();
  // Cancel never writes.
  await id(`printer-toggle-${p1}`).click();await id('confirm-cancel').click();await id('confirm-dialog').waitFor({state:'hidden'});assert.equal(db.calls.length,0);
  await id(`printer-toggle-${p1}`).click();await confirm('Pause');await result('paused');await page.locator(`[data-testid="printer-row-${p1}"][data-active="false"]`).waitFor();
  await id(`printer-toggle-${p1}`).click();await confirm('Reactivate');await result('reactivated');await page.locator(`[data-testid="printer-row-${p1}"][data-active="true"]`).waitFor();
  await id(`printer-test-${p1}`).click();await confirm('test');await result('Test print sent');await id('job-row-77777777-7777-4777-8777-999999999999').waitFor();
  await id(`printer-rename-${p1}`).click();await id(`printer-rename-input-${p1}`).fill('Bar 2');await id(`printer-rename-${p1}`).click();await confirm('The same name is sent to the Print Server');await result('renamed');await page.getByTestId(`printer-label-${p1}`).getByText('Bar 2',{exact:true}).waitFor();
  record('Printers: cancel, pause, reactivate, test print, rename');
  await id('ps-scan').click();await confirm('scan');await page.locator('[data-testid="ps-scan-status"][data-status="done"]').waitFor();
  await id('scan-candidate-AA:BB:CC:DD:EE:01').getByText('Already registered').waitFor();await id(`scan-candidate-${NEW_MAC}`).getByText('Unknown model').waitFor();
  await id(`scan-add-${NEW_MAC}`).click();assert.equal(await id('printer-form-mac').inputValue(),NEW_MAC);
  await id('printer-form-submit').click();await result('Enter a name');
  await id('printer-form-label').fill('Bar 2');await id('printer-form-location').fill('Terrace');await id('printer-form-submit').click();await confirm(NEW_MAC);await result('already uses this name');
  await id('printer-form-label').fill('Terrace');await id('printer-form-submit').click();await confirm('Terrace');await result('added');await id('printer-row-66666666-6666-4666-8666-666666666663').waitFor();
  await id(`scan-candidate-${NEW_MAC}`).getByText('Already registered').waitFor();
  record('Scan: poll to done, candidates, add from a candidate, mapped errors');
  await id(`printer-remove-${p1}`).click();await confirm('Remove');await id('remove-in-use').getByText('Caja 1').waitFor();
  assert.deepEqual(db.calls.at(-1),['ps_panel_remove_printer',{p_printer_id:p1,p_force:false}]);await id(`printer-row-${p1}`).waitFor();
  await confirm('still in use');await result('removed');await id(`printer-row-${p1}`).waitFor({state:'detached'});assert.deepEqual(db.calls.at(-1),['ps_panel_remove_printer',{p_printer_id:p1,p_force:true}]);
  record('Remove: in-use warning lists workstations, then forces on a second confirmation');
  const [download]=await Promise.all([page.waitForEvent('download'),id('ps-cert-download').click()]);assert.equal(download.suggestedFilename(),`playerp-${v1}-ca.crt`);await result('downloaded');
  record('Certificate: public PEM download');
  assert.equal(await id('ps-assign').innerText(),'Replace Print Server');await id('ps-assign').click();await confirm('its queue is not inherited');
  assert.equal(await id('enrollment-code').innerText(),CODE);await id('enrollment-dialog').getByText('cannot be shown again').waitFor();
  const stored=await page.evaluate(()=>JSON.stringify([{...localStorage},{...sessionStorage},location.href]));assert(!stored.includes(CODE),'code never stored');
  await page.screenshot({path:out+'print-servers-code.png'});
  await id('enrollment-close').click();await id('enrollment-code').waitFor({state:'detached'});assert(!(await page.content()).includes(CODE),'code gone after closing');
  await id('ps-enrollment-pending').getByText('Enrollment pending until').waitFor();
  assert.deepEqual(db.calls.find(c=>c[0]==='ps_panel_create_enrollment')[1],{p_venue_id:v1,p_label:null,p_ttl_minutes:60});
  record('Replace: code shown once, not stored, gone after closing; pending until shown');
  await page.screenshot({path:out+'print-servers-detail.png',fullPage:true});
  await id('ps-revoke').click();await confirm('Revoke');await result('Jobs cancelled: 2');await page.locator('[data-testid="ps-state"][data-state="pending"]').waitFor();
  assert.equal(await id('ps-assign').innerText(),'Assign Print Server');assert.equal(await id('ps-cert-download').count(),0);assert(await id('ps-cert-pending').isVisible());
  assert(!(await page.content()).includes('HASH-SHOULD-NEVER-SHOW'));
  record('Revoke: confirmation, result, certificate not reported');
  await ctx.close();
 }
 {
  const {ctx,page,db}=await setup({width:390});
  db.printers[0].workstations=Array.from({length:45},(_,i)=>({id:'w'+i,name:'Workstation '+(i+1)}));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(origin+`/admin/print-servers/${v1}`);await page.getByTestId('ps-state').waitFor();
  await page.getByTestId('printers-toggle').click();
  const toggle=page.getByTestId(`printer-toggle-${p1}`);
  await toggle.click();await page.getByTestId('confirm-accept').click();
  await page.getByTestId('confirm-dialog').waitFor({state:'detached'});
  await page.waitForFunction(id=>document.activeElement===document.querySelector(`[data-testid="${id}"]`),`printer-toggle-${p1}`,{timeout:3000});
  const opener=page.getByTestId(`printer-remove-${p1}`);await opener.click();await page.getByTestId('confirm-accept').click();
  await page.getByTestId('remove-in-use').waitFor();
  const body=page.locator('.ps-dialog-body');assert(await body.evaluate(e=>e.scrollHeight>e.clientHeight),'long dialog body scrolls');
  const before=await page.locator('.ps-dialog-actions').boundingBox();await body.evaluate(e=>e.scrollTop=e.scrollHeight);
  const after=await page.locator('.ps-dialog-actions').boundingBox();assert.equal(before.y,after.y);assert(after.y+after.height<=1000);
  await page.getByTestId('confirm-cancel').focus();await page.keyboard.press('Tab');assert(await page.getByTestId('confirm-accept').evaluate(e=>e===document.activeElement));
  const outline=await page.getByTestId('confirm-accept').evaluate(e=>getComputedStyle(e).outlineStyle);assert.notEqual(outline,'none');
  assert(await page.locator('.sidebar').evaluate(e=>parseFloat(getComputedStyle(e).transitionDuration)<0.01),'reduced motion');
  await page.screenshot({path:out+'dialog-scroll-390.png'});
  await page.keyboard.press('Escape');assert(await opener.evaluate(e=>e===document.activeElement));
  record('390px long dialog: scroll body, fixed actions, trapped/returned focus, visible focus and reduced motion');await ctx.close();
 }
 {
  const {ctx,page}=await setup({width:834});await page.goto(origin+`/admin/print-servers/${v1}`);await page.getByTestId('ps-state').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');await page.goto(origin+'/admin/print-servers/list');await page.getByTestId(`fleet-row-${v1}`).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
  await page.getByRole('button',{name:'ES',exact:true}).click();await page.getByText('3 de 3',{exact:true}).waitFor();record('Tablet width without overflow, ES catalog');await ctx.close();
 }
 {
  const {ctx,page,db}=await setup({role:'operations'});
  for(const path of ['/admin/print-servers',`/admin/print-servers/${v1}`]){await page.goto(origin+path);await page.getByRole('heading',{name:'Access denied',exact:true}).waitFor();}
  await page.goto(origin+'/admin');await page.locator('.sidebar-nav').getByRole('link',{name:'Directory',exact:true}).waitFor();assert.equal(await page.locator('.sidebar-nav').getByRole('link',{name:'Print Servers',exact:true}).count(),0);assert.deepEqual(db.seen,[]);
  record('Operations: no nav entry, denied on both routes, no fleet RPC');await ctx.close();
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:records.length,fixtureOnly:true}));
}finally{await browser.close();}
