// Isolated browser acceptance. Uses the real built portal with synthetic API
// responses; never claims live authentication/RLS or sends printer commands.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
const out=process.env.SMOKE_OUTPUT_DIR??'test-results/print-dashboard';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
const user={id:uid,email:'dashboard@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-02T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const at='2026-10-02T17:00:00Z';
const item=(id,changes={})=>({id,device_id:id,label:`Device ${id}`,hostname:null,assignment:'assigned',venue_id:a,venue_name:'Harbor',last_venue_name:null,connection:'online',last_seen_at:at,last_report_at:at,firmware_version:'0.3.3',firmware_known:true,error_count:0,warning_count:0,printers_total:2,pending_jobs:0,last_issue_at:null,issues:[],...changes});
const items=[item('one'),item('two',{venue_id:b,venue_name:'Garden',connection:'offline',firmware_version:'0.3.2',error_count:3,warning_count:2,last_issue_at:at,issues:[{level:'error',source:'printer',code:'printer_error',count:1,at},{level:'warning',source:'printer',code:'printer_unreachable',count:1,at},{level:'warning',source:'queue',code:'queue_stalled',count:1,at}]}),item('three',{connection:'unknown',firmware_version:null,firmware_known:false,last_seen_at:null,last_report_at:null}),item('four',{assignment:'unassigned',venue_id:null,venue_name:null,last_venue_name:'Garden',connection:'unassigned',firmware_version:null,firmware_known:false,printers_total:null,pending_jobs:null})];
const report={origin,backend:'Intercepted synthetic responses, not live RLS/authentication evidence',checks:[],pageErrors:[]};
const record=s=>{report.checks.push(s);console.log('PASS '+s);};
async function setup({width=1440,role='super_admin',mode='ready'}={}) {
 const ctx=await browser.newContext({viewport:{width,height:950},locale:'en'});
 await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','en');},session);
 const db={mode,calls:[],at,items:structuredClone(items)};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url()),name=url.pathname.split('/').pop();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(url.pathname.endsWith('/user')?user:session);
  if(url.pathname==='/rest/v1/staff_profiles')return send(null);
  db.calls.push(name);
  if(name==='is_platform_staff')return send(role!=='owner');
  if(name==='portal_access')return send({is_platform_staff:role==='super_admin',platform_role:role,owner_venues:role==='owner'?[{id:a,name:'Harbor'}]:[]});
  if(name==='portal_owner_venues')return send([{id:a,name:'Harbor'}]);
  if(name==='portal_tenant_directory')return send([]);
  if(name==='portal_ps_inventory') {
   if(db.mode==='loading')await new Promise(resolve=>db.release=resolve);
   if(db.mode==='error')return send({code:'XX000'},500);
   if(db.mode==='denied')return send({code:'42501'},403);
   return send({contract_version:1,generated_at:db.at,online_window_seconds:180,summary:{total:9999},items:db.mode==='empty'?[]:db.items});
  }
  if(name==='portal_ps_fleet')return send(db.fleet??[{venue_id:a,venue_name:'Harbor',print_server:{id:'one',status:'active',software_version:'0.3.3',online:true,last_seen_at:at},pending_enrollment:null,printers_total:0,printers_active:0,printers_paused:0,printers_with_error:0,pending_jobs:0}]);
  if(name==='ps_panel_state')return send({venue_id:a,can_manage:true,print_server:{id:'one',status:'active',software_version:'0.3.3',online:true,last_seen_at:at},pending_enrollment:null,printers:[],last_scan:null});
  throw new Error('Unexpected request '+name);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.pageErrors.push(e.message));
 return {ctx,page,db};
}
const ids=page=>page.locator('[data-testid^="inventory-row-"]');
async function metric(page,key,n){await expect(page.getByTestId('dashboard-metric-'+key).locator('strong')).toHaveText(String(n));}
try {
 for(const width of [1440,390]) {
  const {ctx,page,db}=await setup({width});await page.goto(origin+'/admin/print-servers');
  await expect(ids(page)).toHaveCount(4);
  await expect(page.getByTestId('inventory-filter-venue').locator('option')).toHaveText(['All venues','Assigned to venue','Unassigned']);
  await page.getByTestId('inventory-filter-venue').selectOption('__assigned__');
  await expect(ids(page)).toHaveCount(3);await metric(page,'total',3);await metric(page,'unassigned',0);
  await expect(page.getByTestId('dashboard-firmware-0.3.3')).toContainText('1 / 3 · 33.3%');
  await expect(page.getByTestId('inventory-row-four')).toHaveCount(0);
  await page.getByTestId('inventory-filter-venue').selectOption('__unassigned__');
  await expect(page.getByTestId('inventory-row-four')).toBeVisible();await expect(ids(page)).toHaveCount(1);await metric(page,'total',1);
  await expect(page.getByTestId('inventory-row-four').getByRole('link')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-firmware-__unknown__')).toContainText('1 / 1 · 100%');
  await page.getByTestId('dashboard-filter-clear').click();
  for(const [k,n] of [['total',4],['online',1],['offline',1],['unknown',1],['errors',1],['unassigned',1]])await metric(page,k,n);
  await expect(page.getByTestId('dashboard-firmware-__unknown__')).toContainText('2 / 4 · 50%');
  await expect(page.getByTestId('dashboard-firmware-0.3.3')).toContainText('1 / 4 · 25%');
  await expect(page.locator('time[datetime="'+at+'"]')).not.toHaveCount(0);
  for(const [filter,value,want] of [['venue','__assigned__',3],['state','online',1],['state','offline',1],['state','unknown',1],['state','unassigned',1],['state','errors',1],['state','warnings',1],['version','0.3.2',1],['version','__unknown__',2],['venue','__unassigned__',1]]) {
   await page.getByTestId('inventory-filter-'+filter).selectOption(value);await expect(ids(page)).toHaveCount(want);await metric(page,'total',want);await page.getByTestId('dashboard-filter-clear').click();
  }
  await page.getByTestId('inventory-filter-venue').selectOption('__assigned__');await page.getByTestId('inventory-filter-version').selectOption('__unknown__');await page.getByTestId('inventory-filter-state').selectOption('unknown');
  await expect(ids(page)).toHaveCount(1);await metric(page,'unknown',1);await expect(page.getByTestId('dashboard-firmware-__unknown__')).toContainText('1 / 1 · 100%');
  await page.getByTestId('dashboard-metric-total').click();await expect(page.getByTestId('inventory-filter-state')).toHaveValue('unknown');await expect(ids(page)).toHaveCount(1);
  await page.getByTestId('inventory-filter-state').selectOption('online');await expect(page.getByTestId('dashboard-empty')).toBeVisible();await metric(page,'total',0);await expect(page.getByTestId('dashboard-firmware')).not.toContainText('NaN');
  await page.getByTestId('dashboard-filter-clear').click();
  await page.getByTestId('inventory-filter-search').fill('Garden');await expect(ids(page)).toHaveCount(1);await page.getByTestId('dashboard-filter-clear').click();
  await page.getByTestId('dashboard-metric-errors').click();await expect(ids(page)).toHaveCount(1);await expect(page.getByTestId('inventory-filter-state')).toHaveValue('errors');
  const issueRow=page.getByTestId('inventory-row-two');const disclosure=issueRow.locator('details');if(await disclosure.count())await disclosure.locator('summary').click();await expect(issueRow).toContainText('queue_stalled');
  await page.getByTestId('dashboard-filter-clear').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
  await page.getByRole('button',{name:'ES',exact:true}).click();await expect(page.getByTestId('dashboard-metric-unknown')).toContainText('Sin reporte');
  await expect(page.getByTestId('inventory-filter-venue').locator('option')).toHaveText(['Todos los venues','Asignados a un venue','Sin asignar']);
  await page.getByTestId('inventory-filter-venue').selectOption('__assigned__');await metric(page,'total',3);
  await expect(page.getByTestId('dashboard-firmware-0.3.3')).toContainText('1 / 3 · 33,3%');
  await page.getByTestId('inventory-filter-venue').selectOption('__unassigned__');await expect(ids(page)).toHaveCount(1);await metric(page,'total',1);
  await page.getByTestId('dashboard-filter-clear').click();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:`${out}/dashboard-${width}-es.png`,fullPage:true});
  record(`${width}px: exact three assignment options EN/ES without venue names; assigned 3 devices (33.3% each), unassigned 1 (100%); shared filters/counters/timestamp, unknown firmware 50%, combined denominator 1/1, notices, empty filter and Spanish; no horizontal overflow`);
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await page.getByTestId('inventory-row-one').getByRole('link').click();await expect(page.getByTestId('ps-state')).toHaveText('Online');
  await page.goto(origin+'/admin/print-servers');await page.getByTestId('dashboard-open-list').click();await expect(page.getByTestId('fleet-row-'+a)).toBeVisible();await page.getByRole('link',{name:'View dashboard',exact:true}).click();await expect(page.getByTestId('dashboard-page')).toBeVisible();
  record(`${width}px: dashboard links to existing detail/list and back`);
  db.mode='error';await page.getByTestId('dashboard-refresh').click();await expect(page.getByTestId('dashboard-stale')).toBeVisible();await expect(ids(page)).toHaveCount(4);
  db.mode='ready';db.at='2026-10-02T17:01:00Z';db.items=db.items.slice(0,1);await page.getByTestId('dashboard-refresh').click();await expect(ids(page)).toHaveCount(1);await metric(page,'total',1);await expect(page.getByTestId('dashboard-stale')).toHaveCount(0);await expect(page.locator('time[datetime="'+db.at+'"]')).toHaveCount(1);
  assert(db.calls.filter(n=>n.startsWith('ps_panel_')).every(n=>n==='ps_panel_state'),'no device commands');
  record(`${width}px: failed refresh visibly retains old snapshot; successful refresh replaces counts/list/time together`);await ctx.close();
 }
 // Paginated views retain full-filter aggregates and share the captured timestamp.
 for(const width of [1440,390]) {
  const {ctx,page,db}=await setup({width});
  db.items=Array.from({length:63},(_,i)=>item(`paged-${String(i).padStart(2,'0')}`,{venue_id:i<40?a:b,venue_name:i<40?'Harbor':'Garden',firmware_version:i<40?'0.3.3':null,firmware_known:i<40}));
  db.fleet=db.items.map((device,i)=>({venue_id:`venue-${i}`,venue_name:`Venue ${String(i).padStart(2,'0')}`,print_server:{id:device.id,status:'active',software_version:device.firmware_version,online:true,last_seen_at:at},pending_enrollment:null,printers_total:0,printers_active:0,printers_paused:0,printers_with_error:0,pending_jobs:0}));
  await page.goto(origin+'/admin/print-servers');
  const next=page.getByTestId('dashboard-pagination-next'),prev=page.getByTestId('dashboard-pagination-prev'),size=page.getByTestId('dashboard-pagination-size');
  await expect(ids(page)).toHaveCount(25);await expect(prev).toBeDisabled();await metric(page,'total',63);
  await expect(page.getByTestId('dashboard-firmware-__unknown__')).toContainText('23 / 63');
  const seen=[...await ids(page).evaluateAll(rows=>rows.map(row=>row.dataset.testid))];
  await next.click();await expect(ids(page)).toHaveCount(25);await metric(page,'total',63);
  seen.push(...await ids(page).evaluateAll(rows=>rows.map(row=>row.dataset.testid)));
  await next.click();await expect(ids(page)).toHaveCount(13);await expect(next).toBeDisabled();
  seen.push(...await ids(page).evaluateAll(rows=>rows.map(row=>row.dataset.testid)));
  assert.equal(seen.length,63);assert.equal(new Set(seen).size,63);
  await expect(page.getByTestId('dashboard-pagination-range')).toHaveText('51–63 of 63 results');
  await prev.click();await expect(ids(page)).toHaveCount(25);assert.deepEqual(await ids(page).evaluateAll(rows=>rows.map(row=>row.dataset.testid)),seen.slice(25,50));
  await page.getByTestId('inventory-filter-version').selectOption('0.3.3');await expect(ids(page)).toHaveCount(25);await expect(prev).toBeDisabled();await metric(page,'total',40);
  await expect(page.getByTestId('dashboard-firmware-0.3.3')).toContainText('40 / 40 · 100%');
  await next.click();await expect(ids(page)).toHaveCount(15);await size.selectOption('10');await expect(ids(page)).toHaveCount(10);await expect(prev).toBeDisabled();
  await next.click();await page.getByTestId('dashboard-filter-clear').click();await expect(prev).toBeDisabled();await metric(page,'total',63);
  await size.selectOption('50');await expect(ids(page)).toHaveCount(50);await next.click();await expect(ids(page)).toHaveCount(13);
  db.items=db.items.slice(0,3);db.at='2026-10-02T18:00:00Z';await page.getByTestId('dashboard-refresh').click();await expect(ids(page)).toHaveCount(3);await metric(page,'total',3);await expect(prev).toBeDisabled();await expect(next).toBeDisabled();
  await expect(page.locator('time[datetime="'+db.at+'"]')).toHaveCount(1);
  await page.getByTestId('dashboard-open-list').click();
  const fleetRows=page.locator('[data-testid^="fleet-row-"]'),fnext=page.getByTestId('fleet-pagination-next'),fprev=page.getByTestId('fleet-pagination-prev');
  await expect(fleetRows).toHaveCount(25);await expect(fprev).toBeDisabled();await expect(page.getByTestId('fleet-count')).toHaveText('63 of 63');
  const fleetSeen=[...await fleetRows.evaluateAll(rows=>rows.map(row=>row.dataset.testid))];
  await fnext.click();await expect(fleetRows).toHaveCount(25);fleetSeen.push(...await fleetRows.evaluateAll(rows=>rows.map(row=>row.dataset.testid)));
  await fnext.click();await expect(fleetRows).toHaveCount(13);await expect(fnext).toBeDisabled();fleetSeen.push(...await fleetRows.evaluateAll(rows=>rows.map(row=>row.dataset.testid)));
  assert.equal(new Set(fleetSeen).size,63);
  await expect(page.getByTestId('fleet-pagination-range')).toHaveText('51–63 of 63 results');
  await fprev.click();await expect(fleetRows).toHaveCount(25);assert.deepEqual(await fleetRows.evaluateAll(rows=>rows.map(row=>row.dataset.testid)),fleetSeen.slice(25,50));
  await page.getByTestId('fleet-filter-version').selectOption('0.3.3');await expect(fleetRows).toHaveCount(25);await expect(fprev).toBeDisabled();await expect(page.getByTestId('fleet-count')).toHaveText('40 of 63');
  await fnext.click();await page.getByTestId('fleet-pagination-size').selectOption('10');await expect(fleetRows).toHaveCount(10);await expect(fprev).toBeDisabled();
  await fnext.click();await page.getByTestId('fleet-filter-clear').click();await expect(fprev).toBeDisabled();
  await page.getByRole('button',{name:'ES',exact:true}).click();
  await expect(page.getByTestId('fleet-pagination-page')).toContainText('Página 1');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'pagination has no horizontal page overflow');
  await page.getByTestId('fleet-pagination-page').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/pagination-${width}-es.png`});
  record(`${width}px: 63 devices/venues across three pages without duplicates or omissions; full-filter counters and firmware denominator; filter/size reset, refresh shrink, ES pagination and no overflow`);
  await ctx.close();
 }
 for(const mode of ['loading','empty','error','denied']) {
  const {ctx,page,db}=await setup({mode});await page.goto(origin+'/admin/print-servers');
  if(mode==='loading'){await expect.poll(()=>typeof db.release).toBe('function');await expect(page.getByText('Loading',{exact:false}).first()).toBeVisible();db.mode='ready';db.release();await expect(ids(page)).toHaveCount(4);}
  if(mode==='empty'){await expect(page.getByTestId('dashboard-empty')).toBeVisible();await metric(page,'total',0);await expect(page.getByTestId('inventory-filter-venue').locator('option')).toHaveText(['All venues','Assigned to venue','Unassigned']);}
  if(mode==='error'){await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();db.mode='ready';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(ids(page)).toHaveCount(4);}
  if(mode==='denied'){await expect(page.getByRole('heading',{name:'Access denied',exact:true})).toBeVisible();await expect(page.getByTestId('dashboard-page')).toHaveCount(0);}
  record('Initial state '+mode);await ctx.close();
 }
 for(const role of ['operations','support','owner']) {
  const {ctx,page,db}=await setup({role});await page.goto(origin+'/admin/print-servers');if(role==='owner')await expect(page.locator('.owner-venue-card')).toBeVisible();else await expect(page.getByRole('heading',{name:'Access denied',exact:true})).toBeVisible();assert(!db.calls.includes('portal_ps_inventory'));record(`${role}: global route blocked before inventory request (synthetic access response)`);await ctx.close();
 }
 assert.deepEqual(report.pageErrors,[]);
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.checks.length,synthetic:true}));
}finally{await browser.close();}
