// Focused PE-409 acceptance: isolated, synthetic API responses; no backend mutations.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.SMOKE_OUTPUT_DIR??'test-results/pe409';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
const user={id:uid,email:'pe409@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-02T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const date=i=>`2026-10-${i%2?'11':'10'}T23:59:59.999Z`,n=63,seq=fn=>Array.from({length:n},(_,i)=>fn(i));
const venues=seq(i=>({id:i===0?a:i===1?b:`22222222-2222-4222-8222-${String(i).padStart(12,'0')}`,name:`Fixture ${i}`,slug:`fixture-${i}`,is_active:i%2===0,city:'Fixture City'}));
const fleet=venues.map((v,i)=>({venue_id:v.id,venue_name:v.name,venue_slug:v.slug,venue_is_active:v.is_active,print_server:{id:`ps-${i}`,label:`Fixture ${i}`,hostname:`Fixture ${i}`,device_id:`device-${i}`,status:'active',software_version:'0.3.15',online:i%2===0,last_seen_at:date(i)},pending_enrollment:null,printers_total:n,printers_active:32,printers_paused:31,printers_with_error:0,pending_jobs:0}));
const printers=seq(i=>({id:`printer-${i}`,label:`Fixture ${i}`,model:'Printer',is_active:i%2===0,print_route:'ps',last_report_at:date(i),created_at:date(i),pending_jobs:0,workstations:[]}));
const releases=seq(i=>({id:`release-${i}`,version:`0.3.${i}`,revision:`Fixture ${i} revision-very-long-without-break-${'abc'.repeat(20)}`,model:'rpi4-2gb',arch:'arm64',filename:`Fixture-${i}.zip`,sha256:'a'.repeat(64),status:'ready',notes:'Fixture long notes / notas largas. '.repeat(12),created_at:date(i),size_bytes:1000000,installed_count:2,edition_id:null,edition_status:null}));
const otaDevices=seq(i=>({print_server_id:`ps-${i}`,venue_id:a,venue_name:'Fixture Venue',hostname:`Fixture ${i}`,serial:`serial-${i}`,installed_version:'0.3.14',last_seen_at:date(i),online:i%2===0,target:null}));
const targets=seq(i=>({id:`target-${i}`,deployment_id:'deployment-0',print_server_id:`ps-${i}`,hostname:`Fixture ${i}`,venue_name:'Fixture Venue',status:i%2?'failed':'committed',phase:i%2?'health_check':'committed',progress:100,desired_version:'0.3.15',installed_version:'0.3.14',issued_at:date(i),updated_at:date(i),error_code:i%2?'health_failed':null,error_detail:i%2?'Health check timed out':null}));
const deployments=seq(i=>({id:`deployment-${i}`,version:`0.3.${i}`,ring:'lab',group_name:`Fixture ${i}`,created_at:date(i),target_count:n,target_by_status:{committed:32,failed:31}}));
const events=seq(i=>({id:String(i),target_id:'target-0',print_server_id:'ps-0',target_desired_version:'0.3.15',created_at:date(i),phase:i===0?'future_phase':i%2?'health_check':'committed',status:i%2?'failed':'committed',progress:100,error_code:i%2?'health_failed':null,error_detail:i%2?'Health check timed out':null,detail:i===0?{updater_version:'1.0.0'}:i%2?{message:'Health check failed',error:'socket timeout'}:{message:'Application is healthy'}}));
const audits=seq(i=>({id:String(i),created_at:date(i),at:date(i),action:'ps_ota_deployed',target_id:`deployment-${i}`,metadata:{version:'0.3.15',fixture:i,detail:'Long technical content '+ 'x'.repeat(800)},actor_email:'fixture@example.invalid'}));
const jobs=seq(i=>({id:`job-${i}`,created_at:date(i),status:i%2?'failed':'done',source_type:'test',attempts:1,error_code:i%2?'printer_unreachable':null}));
const report={origin,kind:'Isolated synthetic 63-row fixtures; not live RLS evidence',lists:[],checks:[],screenshots:[],errors:[]};
async function setup(width=1440,role='super_admin') {
 const ctx=await browser.newContext({viewport:{width,height:950},locale:'en-US'});await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','en');},session);
 const db={calls:[],overviewAuditRows:[],mode:'ready',endpoint:'',release:null};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url()),name=url.pathname.split('/').pop();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(url.pathname.endsWith('/user')?user:session);
  if(name==='staff_profiles')return send(null);
  const args=route.request().postDataJSON()??{};db.calls.push({name,args});
  if(name===db.endpoint){if(db.mode==='loading')await new Promise(r=>db.release=r);if(db.mode==='error')return send({code:'XX000'},500);}
  if(name==='is_platform_staff')return send(role!=='owner');
  if(name==='portal_access')return send({is_platform_staff:role==='super_admin',platform_role:role,owner_venues:role==='owner'?[venues[0]]:[]});
  if(name==='portal_tenant_directory')return send(venues);
  if(name==='portal_owner_venues')return send([venues[0]]);
  if(name==='portal_tenant_detail')return send({venue:venues.find(v=>v.id===args.p_venue_id),print_servers:[]});
  if(name==='platform-staff-admin'&&args.action==='list')return send({members:seq(i=>({user_id:`user-${i}`,email:`fixture-${i}@example.invalid`,full_name:`Fixture ${i}`,role:'support',status:i%2?'invited':'active',created_at:date(i),invited_at:date(i)}))});
  if(name==='platform-identity-admin'&&args.action==='list')return send({venue:venues.find(v=>v.id===args.venue_id),roles:['manager','front_desk'],users:seq(i=>({user_id:`user-${i}`,email:`fixture-${i}@example.invalid`,full_name:`Fixture ${i}`,role:'manager',status:i%2?'invited':'active',member_since:date(i),other_venue_count:7}))});
  if(name==='portal_ps_fleet')return send(fleet);
  if(name==='portal_ps_devices')return send({devices:seq(i=>({id:`device-${i}`,serial:`Fixture ${i}`,hostname:`Fixture ${i}`,model:'rpi4-2gb',status:i%2?'stock':'assigned',venue_id:i%2?null:a,venue_name:i%2?null:'Fixture Venue',created_at:date(i)}))});
  if(name==='portal_ps_inventory')return send({contract_version:1,generated_at:date(0),online_window_seconds:180,items:seq(i=>({id:`device-${i}`,device_id:`device-${i}`,label:`Fixture ${i}`,hostname:`Fixture ${i}`,assignment:i%2?'unassigned':'assigned',venue_id:i%2?null:a,venue_name:i%2?null:'Fixture Venue',last_venue_name:null,connection:i%2?'unassigned':'online',last_seen_at:date(i),last_report_at:date(i),firmware_version:'0.3.15',firmware_known:true,error_count:0,warning_count:0,printers_total:1,pending_jobs:0,last_issue_at:null,issues:[]}))});
  if(name==='ps_ota_target_events')return send({ok:true,events});
  if(name==='ps_firmware_list')return send({releases,installed:seq(i=>({version:`Fixture ${i}`,print_servers:2,uploaded:i%2===0}))});
  if(name==='ps_panel_state'){if(role==='owner'&&args.p_venue_id!==a)return send({code:'42501'},403);const row=fleet.find(v=>v.venue_id===args.p_venue_id);return send({venue_id:args.p_venue_id,can_manage:true,print_server:row.print_server,printers,pending_enrollment:null,last_scan:null});}
  if(name==='ps_panel_recovery_label')return send({ok:true,label_version:1,ready:false,missing:['device_not_assigned'],wifi_rotation_pending:false,label:null});
  if(name==='ps_admin_legacy_credentials_context')return send({ok:true,venue_id:args.p_venue_id,device_id:null,legacy:false});
  if(name==='ps_panel_device')return send({ok:true,device:null,cert:{},rotations:[],cert_operations:[],can_manage:false,is_platform_admin:true});
  if(name==='ps_panel_ota')return send({ok:true,print_servers:[]});
  if(name==='ps_ota_admin_overview'){assert.equal(args.p_include_audit,false);db.overviewAuditRows.push(0);return send({ok:true,keys:[{key_id:'fixture',active:true}],releases,groups:seq(i=>({id:`group-${i}`,name:`Fixture ${i}`,ring:'lab',created_at:date(i),members:[]})),devices:otaDevices,deployments:deployments.slice(0,50),audit_included:false});}
  const kind=name.match(/^ps_ota_admin_(deployments|targets|audit|events)_page$/)?.[1];
  if(kind||name==='ps_panel_printer_jobs') {
   let items=structuredClone(kind?{deployments,targets,audit:audits,events}[kind]:jobs);
   const timeKey=kind==='targets'?'issued_at':'created_at';
   if(args.p_from&&args.p_to&&args.p_from>=args.p_to)return send({code:'22023'},400);
   items=items.filter(x=>(!args.p_query||JSON.stringify(x).toLowerCase().includes(args.p_query.toLowerCase()))&&(!args.p_status||x.status===args.p_status)&&(!args.p_action||x.action===args.p_action)&&(!args.p_from||Date.parse(x[timeKey])>=Date.parse(args.p_from))&&(!args.p_to||Date.parse(x[timeKey])<Date.parse(args.p_to))&&(!args.p_phase||x.phase===args.p_phase));
   const total=items.length,offset=args.p_offset??0,limit=args.p_limit??25;
   return send({ok:true,total,offset,limit,aggregates:{population:'fixture',target_by_status:{committed:32,failed:31}},[kind?'items':'jobs']:items.slice(offset,offset+limit)});
  }
  report.errors.push(`Unexpected/forbidden request ${name}`);return route.abort();
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));return {ctx,page,db};
}
async function confirmAudit(page,id){if(id==='audit')await page.getByTestId('ota-audit-search').click();}
async function traverse(page,id,rows,search,dateId=id){
 const next=page.getByTestId(`${id}-pagination-next`),prev=page.getByTestId(`${id}-pagination-prev`),range=page.getByTestId(`${id}-pagination-range`);
 await expect(rows).toHaveCount(25);await expect(range).toContainText('63');
 const input=page.getByTestId(`${id}-pagination-input`);
 await input.fill('3');await input.press('Enter');await expect(rows).toHaveCount(13);await expect(input).toHaveValue('3');
 await prev.click();await expect(rows).toHaveCount(25);await expect(input).toHaveValue('2');
 await input.fill('1');await page.getByTestId(`${id}-pagination-go`).click();await expect(input).toHaveValue('1');
 await next.click();await expect(rows).toHaveCount(25);await next.click();await expect(rows).toHaveCount(13);await expect(next).toBeDisabled();
 const record={list:id,total:63,first:25,last:13,pages:3};
 await page.getByTestId(search).fill('no-match-pe409');await confirmAudit(page,id);await expect(rows).toHaveCount(0);await expect(prev).toBeDisabled();await page.getByTestId(search).fill('');await confirmAudit(page,id);await expect(rows).toHaveCount(25);
 if(await page.getByTestId(`${dateId}-from`).count()) {await next.click();await page.getByTestId(`${dateId}-from`).fill('2026-10-11');await page.getByTestId(`${dateId}-to`).fill('2026-10-11');await confirmAudit(page,id);await expect(range).toContainText('31');await expect(prev).toBeDisabled();record.dateTotal=31;await page.getByTestId(`${dateId}-from`).fill('2026-10-12');await expect(page.locator('[role="alert"]').filter({hasText:'start date'})).toBeVisible();await expect(rows).toHaveCount(0);await page.getByTestId(`${dateId}-from`).fill('');await page.getByTestId(`${dateId}-to`).fill('');await confirmAudit(page,id);}
 await next.click();await page.getByTestId(`${id}-pagination-size`).selectOption('10');await expect(prev).toBeDisabled();await expect(rows).toHaveCount(10);record.resetAndEmpty=true;report.lists.push(record);console.log('PASS '+id);
}
try {
 const {ctx,page,db}=await setup();
 for(const [path,id,selector,search,dateId] of [
  ['/admin/tenants','tenants','.directory-list .directory-row','tenants-search'],
  ['/admin/staff','staff','.staff-table tbody tr','staff-search'],
  [`/admin/tenants/${a}/users`,'venue-users','.staff-table tbody tr','venue-users-search'],
  ['/admin/print-servers','dashboard','[data-testid^="inventory-row-"]','inventory-filter-search','dashboard'],
  ['/admin/print-servers/list','fleet','[data-testid^="fleet-row-"]','fleet-filter-search','fleet'],
  ['/admin/print-servers/inventory','devices','[data-testid^="inv-row-"]','devices-search'],
  ['/admin/print-servers/firmwares','fw-releases','[data-testid^="fw-row-"]','fw-releases-search'],
  [`/admin/tenants/${a}/print-servers/detail`,'printers','[data-testid^="printer-row-"]','printers-search'],
  ['/admin/print-servers/updates','editions','[data-testid^="ota-release-"]','editions-search'],
  ['/admin/print-servers/updates','groups','[data-testid^="ota-group-group-"]','groups-search'],
  ['/admin/print-servers/updates','ota-devices','[data-testid^="ota-device-ps-"]','ota-devices-search'],
  ['/admin/print-servers/updates','deployments','[data-testid^="ota-deployment-deployment-"]','deployments-search'],
  ['/admin/print-servers/updates','audit','[data-testid="ota-audit"] > li','audit-search'],
 ]) {await page.goto(origin+path+'?lang=en');if(id==='printers')await page.getByTestId('printers-toggle').click();await confirmAudit(page,id);await traverse(page,id,page.locator(selector),search,dateId);}
 await page.goto(origin+'/admin/print-servers/updates?lang=en');await page.getByTestId('ota-deployment-deployment-0').locator('summary').click();await traverse(page,'targets-deployment-0',page.locator('[data-testid="ota-deployment-deployment-0"] [data-testid^="ota-target-"]'),'targets-deployment-0-search');
 await page.getByTestId('ota-events-toggle-target-0').click();await expect(page.getByTestId('ota-events-target-0').locator('>li')).toHaveCount(63);await expect(page.getByTestId('events-target-0-pagination')).toHaveCount(0);
 // Original technical payload stays behind the admin disclosure, real errors remain visible.
 await expect(page.getByTestId('ota-events-target-0')).toContainText('Health check timed out');
 await expect(page.getByTestId('ota-events-target-0')).toContainText('Unrecognized phase: future_phase');
 assert(!(await page.getByTestId('ota-events-target-0').innerText()).includes('updater_version'));
 await page.locator('#diagnostic-event-0 summary').click();await expect(page.locator('#diagnostic-event-0 pre')).toContainText('updater_version');
 report.checks.push('Events: useful unknown-phase fallback, real error visible, original technical payload in authorized disclosure');
 // Group member chooser is a complete paginated device list, without saving.
 await page.goto(origin+'/admin/print-servers/updates?lang=en');await page.getByTestId('ota-group-edit-group-0').click();
 await traverse(page,'ota-member-group-0',page.getByTestId('ota-group-editor-group-0').locator('.ota-checklist > li'),'ota-member-group-0-search');
 // One queue, server pagination and complete-day filters, no physical print operation.
 await page.goto(origin+`/admin/tenants/${a}/print-servers/detail?lang=en`);await page.getByTestId('queue-toggle-printer-0').click();
 const q=page.getByTestId('queue-printer-0'),jobsRows=q.locator('[data-testid^="job-row-"]');
 await expect(jobsRows).toHaveCount(10);
 await page.getByTestId('queue-printer-0-pagination-input').fill('7');await page.getByTestId('queue-printer-0-pagination-input').press('Enter');await expect(jobsRows).toHaveCount(3);
 assert(db.calls.some(c=>c.name==='ps_panel_printer_jobs'&&c.args.p_printer_id==='printer-0'&&c.args.p_offset===60));
 await page.getByTestId('queue-printer-0-pagination-input').fill('1');await page.getByTestId('queue-printer-0-pagination-go').click();await expect(jobsRows).toHaveCount(10);let queuePages=1;
 while(await page.getByTestId('queue-printer-0-pagination-next').isEnabled()){const old=await page.getByTestId('queue-printer-0-pagination-input').inputValue();await page.getByTestId('queue-printer-0-pagination-next').click();await expect(page.getByTestId('queue-printer-0-pagination-input')).not.toHaveValue(old);queuePages++;}
 await expect(jobsRows).toHaveCount(3);await page.getByTestId('queue-printer-0-from').fill('2026-10-11');await page.getByTestId('queue-printer-0-to').fill('2026-10-11');await expect(page.getByTestId('queue-total-printer-0')).toContainText('31');await expect(page.getByTestId('queue-printer-0-pagination-prev')).toBeDisabled();
 await page.getByTestId('queue-printer-0-search').fill('no-match');await expect(jobsRows).toHaveCount(0);await expect(page.getByTestId('queue-empty-printer-0')).toBeVisible();
 report.lists.push({list:'printer queue',total:63,first:10,last:3,pages:queuePages,dateTotal:31,resetAndEmpty:true});
 db.endpoint='ps_panel_printer_jobs';db.mode='error';await page.getByTestId('queue-refresh-printer-0').click();await expect(page.getByTestId('queue-error-printer-0')).toBeVisible();db.mode='ready';await page.getByTestId('queue-refresh-printer-0').click();await expect(page.getByTestId('queue-error-printer-0')).toHaveCount(0);await expect(page.getByTestId('queue-empty-printer-0')).toBeVisible();db.endpoint='';report.checks.push('Queue: error visible, refresh recovers, original printer/venue retained');
 // Two selected venues never ask for global fleet or directory data; no other-venue metadata.
 for(const venue of [a,b]) {db.calls=[];await page.goto(origin+`/admin/tenants/${venue}/print-servers?lang=en`);await expect(page.locator('[data-testid^="fleet-row-"]')).toHaveCount(1);assert(!db.calls.some(c=>['portal_ps_fleet','portal_ps_inventory','portal_tenant_directory'].includes(c.name)));assert(db.calls.filter(c=>c.name==='ps_panel_state').every(c=>c.args.p_venue_id===venue));await page.getByTestId('fleet-filter-search').fill(venue===a?'Fixture 1':'Fixture 0');await expect(page.locator('[data-testid^="fleet-row-"]')).toHaveCount(0);}
 await page.goto(origin+`/admin/tenants/${a}/users?lang=en`);await expect(page.getByTestId('venue-users-pagination')).toBeVisible();assert(!/other venues|more venues/.test(await page.locator('main').innerText()));
 report.checks.push('Two venue routes: only requested venue state, no global fleet/directory calls, search cannot find the second venue, cross-venue counts and text absent');
 await page.goto(origin+'/admin/print-servers?lang=en');for(const [value,total] of [['',63],['__assigned__',32],['__unassigned__',31]]){await page.getByTestId('inventory-filter-venue').selectOption(value);await expect(page.getByTestId('dashboard-metric-total').locator('strong')).toHaveText(String(total));}
 report.checks.push('Global assignment All=63, Assigned=32, Not Assigned=31; aggregates independent of page');
 await ctx.close();
 const unauthorized=await setup(1440,'support');await unauthorized.page.goto(origin+'/admin/print-servers/updates?lang=en');await expect(unauthorized.page.locator('.state-denied')).toBeVisible();assert(!unauthorized.db.calls.some(c=>c.name.startsWith('ps_ota_')));report.checks.push('Support role: denied UI and no OTA read requests');await unauthorized.ctx.close();
 // Read states: delay, failure with retry, recovered list. Endpoint fixture only.
 for(const [path,endpoint,id] of [['/admin/tenants','portal_tenant_directory','tenants'],['/admin/staff','platform-staff-admin','staff'],[`/admin/tenants/${a}/users`,'platform-identity-admin','venue-users'],['/admin/print-servers','portal_ps_inventory','dashboard'],['/admin/print-servers/list','portal_ps_fleet','fleet'],['/admin/print-servers/inventory','portal_ps_devices','devices'],['/admin/print-servers/firmwares','ps_firmware_list','fw-releases'],['/admin/print-servers/updates','ps_ota_admin_deployments_page','deployments']]) {
  const x=await setup();x.db.endpoint=endpoint;x.db.mode='loading';await x.page.goto(origin+path+'?lang=en');await expect(x.page.locator(id==='deployments'?'#ota-deployments-title >> xpath=../.. >> [role="status"]':'.state-loading')).toBeVisible();await expect.poll(()=>typeof x.db.release).toBe('function');x.db.mode='ready';x.db.release();await expect(x.page.getByTestId(id+'-pagination')).toBeVisible();
  x.db.mode='error';await x.page.reload();const error=x.page.locator(id==='deployments'?'#ota-deployments-title >> xpath=../.. >> [role="alert"]':'.state-error');await expect(error).toBeVisible();x.db.mode='ready';await error.getByRole('button').click();await expect(x.page.getByTestId(id+'-pagination')).toBeVisible();report.checks.push(id+': loading, read error, retry recovered');await x.ctx.close();
 }
 // Responsive evidence with long synthetic text in both languages, and dialog keyboard.
 for(const width of [320,390,1440])for(const lang of ['en','es']) {
  const x=await setup(width);await x.page.goto(origin+'/admin/print-servers/firmwares?lang='+lang);await expect(x.page.getByTestId('fw-releases-pagination')).toBeVisible();await x.page.getByTestId('fw-releases-pagination-size').selectOption('10');
  assert(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'firmwares no page overflow');await x.page.getByTestId('fw-row-release-0').scrollIntoViewIfNeeded();const fp=`firmwares-${width}-${lang}.png`;await x.page.screenshot({path:out+'/'+fp});report.screenshots.push(fp);
  const inputs=await x.page.locator('[data-testid="fw-releases-filters"] input,[data-testid="fw-releases-filters"] select').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert(inputs.every(h=>h===44),'equal filter heights');
  await x.page.goto(origin+'/admin/print-servers/updates?lang='+lang);await x.page.getByTestId('ota-sign-release-0').click();await expect(x.page.getByTestId('ota-sign-dialog')).toBeVisible();for(let i=0;i<5;i++){await x.page.keyboard.press('Tab');assert(await x.page.getByTestId('ota-sign-dialog').evaluate(e=>e.contains(document.activeElement)));}await x.page.keyboard.press('Escape');await expect(x.page.getByTestId('ota-sign-dialog')).toHaveCount(0);await expect(x.page.getByTestId('ota-sign-release-0')).toBeFocused();
  await x.page.getByTestId('ota-deployment-deployment-0').locator('summary').click();await x.page.getByTestId('ota-events-toggle-target-0').click();await expect(x.page.getByTestId('ota-events-target-0')).toBeVisible();await x.page.getByTestId('ota-events-target-0').locator('>li').first().scrollIntoViewIfNeeded();assert(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'updates no page overflow');const op=`events-${width}-${lang}.png`;await x.page.screenshot({path:out+'/'+op});report.screenshots.push(op);
  const visible=await x.page.getByTestId('ota-events-target-0').innerText();assert(!visible.includes('updater_version'));assert(visible.includes('Health check timed out'));assert(visible.includes(lang==='en'?'Overall progress':'Progreso general'));report.checks.push(`${width}px ${lang}: long firmware and event text, equal filters, modal focus trap/Escape/return, original error preserved`);await x.ctx.close();
 }

 // PE-431: audit-specific RPC never runs before an explicit search, even on re-entry.
 const audit=await setup();await audit.page.goto(origin+'/admin/print-servers/updates?lang=en');
 const auditSection=audit.page.locator('section[aria-labelledby="ota-audit-title"]');
 const auditCalls=()=>audit.db.calls.filter(c=>c.name==='ps_ota_admin_audit_page');
 await expect(audit.page.getByTestId('ota-audit-start')).toBeVisible();
 assert.equal(auditCalls().length,0);
 // Explicitly detect the blocker as well as validating the scoped frontend change.
 assert(audit.db.overviewAuditRows.length>0,'initial overview read observed');
 assert.equal(audit.db.overviewAuditRows[0],0,'overview omits audit before Search');
 report.initialAuditLoad={dedicatedPageCalls:0,overviewRows:audit.db.overviewAuditRows[0],completeOnDemand:true};
 await audit.page.getByTestId('audit-search').fill('0.3.15');
 await audit.page.getByTestId('audit-from').fill('2026-10-10');
 await audit.page.getByTestId('audit-to').fill('2026-10-11');
 assert.equal(auditCalls().length,0);await expect(audit.page.getByTestId('ota-audit')).toHaveCount(0);
 await audit.page.getByTestId('ota-audit-search').click();await expect(audit.page.getByTestId('ota-audit').locator('>li')).toHaveCount(25);
 assert.equal(auditCalls().length,1);assert.equal(auditCalls()[0].args.p_query,'0.3.15');
 const input=audit.page.getByTestId('audit-pagination-input');
 for(const invalid of ['0','4','-1','1.5','','abc','99999999999999999999']){
   await input.fill(invalid);await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');
   await expect(audit.page.locator('#audit-pagination-error')).toBeVisible();assert.equal(auditCalls().length,1);
 }
 await input.fill('3');await input.press('Enter');await expect(audit.page.getByTestId('ota-audit').locator('>li')).toHaveCount(13);
 assert.equal(auditCalls().at(-1).args.p_offset,50);
 await audit.page.getByTestId('audit-pagination-size').selectOption('50');await expect(input).toHaveValue('1');await expect(audit.page.getByTestId('audit-pagination-page')).toContainText('of 2');
 await audit.ctx.grantPermissions(['clipboard-read','clipboard-write']);
 const diagnostic=audit.page.locator('#diagnostic-audit-0');await diagnostic.locator('summary').click();
 for(const width of [1440,390,320]){
   await audit.page.setViewportSize({width,height:950});await diagnostic.scrollIntoViewIfNeeded();
   const box=await diagnostic.boundingBox(),row=await diagnostic.locator('..').boundingBox();
   assert(box.width>row.width-40,`audit detail spans full row at ${width}`);
   assert(await audit.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'audit no viewport overflow');
   await diagnostic.getByRole('button').click();await expect(diagnostic.getByRole('status')).toContainText('Copied');
   assert.equal(await audit.page.evaluate(()=>navigator.clipboard.readText()),await diagnostic.locator('pre').textContent());
   await audit.page.screenshot({path:out+`/audit-${width}.png`});report.screenshots.push(`audit-${width}.png`);
 }
 const before=auditCalls().length;await audit.page.waitForTimeout(11000);assert.equal(auditCalls().length,before,'no audit polling');
 await audit.page.getByTestId('audit-search').fill('no-match');await expect(audit.page.getByTestId('ota-audit')).toHaveCount(0);assert.equal(auditCalls().length,before);
 await audit.page.getByTestId('ota-audit-search').click();await expect(auditSection).toContainText('No records match these filters.');
 await audit.page.reload();await expect(audit.page.getByTestId('ota-audit-start')).toBeVisible();await expect(audit.page.getByTestId('ota-audit')).toHaveCount(0);
 report.checks.push('PE-431: explicit audit page search, draft filters do not request, 1..N validation, direct server offset, size reset, no polling, empty/re-entry reset, full-width diagnostics and exact clipboard at 1440/390/320px');
 report.automaticOverviewCalls=audit.db.calls.filter(c=>c.name==='ps_ota_admin_overview').length;
 assert(audit.db.overviewAuditRows.every(count=>count===0),'all overview refreshes omit audit');
 await audit.ctx.close();
 assert.deepEqual(report.errors,[]);report.frontendChecksPassed=true;report.portalAcceptanceComplete=true;
}finally {await writeFile(out+'/fixtures.json',JSON.stringify(report,null,2));await browser.close();}
assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
