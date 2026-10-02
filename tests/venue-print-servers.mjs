// PE-335: browser acceptance with isolated synthetic responses, including when
// run against DEV. No live backend reads/writes or real printer commands.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'http://127.0.0.1:18799';
const out = process.env.SMOKE_OUTPUT_DIR ?? 'test-results/venue-ps-context';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args:['--no-sandbox']});
const a='22222222-2222-4222-8222-222222222222', b='33333333-3333-4333-8333-333333333333', uid='11111111-1111-4111-8111-111111111111';
const path=id=>`/admin/tenants/${id}/print-servers`;
const venues=[{id:a,name:'Harbor venue',slug:'harbor',is_active:true},{id:b,name:'Garden venue',slug:'garden',is_active:true}];
const user={id:uid,email:'pe333@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-02T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const report={origin,backend:'Synthetic intercepted responses; not live RLS evidence',checks:[],pageErrors:[]};
const record=s=>{report.checks.push(s);console.log('PASS '+s);};
async function setup({width=1440,role='super_admin',mode='ready'}={}) {
 const ctx=await browser.newContext({viewport:{width,height:950},locale:'en'});
 await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.portal.locale','en');},session);
 const db={mode,calls:[],role};
 const rows=venues.map((v,i)=>({venue_id:v.id,venue_name:v.name,venue_slug:v.slug,venue_is_active:true,print_server:{id:`44444444-4444-4444-8444-44444444444${i}`,status:'active',label:i?'Garden device':'Receipt station',hostname:i?'garden-host':'counter-host',device_id:i?'serial-garden':'serial-alpha',software_version:i?'2.3.0':'2.4.1',online:!i,last_seen_at:new Date().toISOString()},pending_enrollment:null,printers_total:1,printers_active:1,printers_paused:0,printers_with_error:0,pending_jobs:1}));
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url()), name=url.pathname.split('/').pop();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(url.pathname.endsWith('/user')?user:session);
  if(url.pathname==='/rest/v1/staff_profiles')return send(null);
  const args=route.request().postDataJSON()??{};db.calls.push({name,args});
  if(name==='is_platform_staff')return send(role!=='owner');
  if(name==='portal_access')return send({is_platform_staff:role==='super_admin',platform_role:role,owner_venues:role==='owner'?[venues[0]]:[]});
  if(name==='portal_owner_venues')return send([venues[0]]);
  if(name==='portal_tenant_directory')return send(venues);
  if(name==='portal_tenant_detail') {
   if(db.mode==='tenant-denied')return send({code:'42501'},403);
   return send({venue:venues.find(v=>v.id===args.p_venue_id),print_servers:[{id:'44444444-4444-4444-8444-444444444440',venue_id:args.p_venue_id,status:'active',software_version:'legacy-summary-version',last_seen_at:null}]});
  }
  if(name==='portal_ps_fleet') {
   if(db.mode==='loading')await new Promise(resolve=>{db.release=resolve;});
   if(db.mode==='error')return send({code:'XX000'},500);
   if(db.mode==='denied')return send({code:'42501'},403);
   if(db.mode==='empty')return send(rows.filter(row=>row.venue_id!==a));
   if(db.mode==='pending')return send(rows.map(row=>({...row,print_server:null,pending_enrollment:{id:'pending-id',label:'Receipt station'},printers_total:0,pending_jobs:0})));
   if(db.mode==='none')return send(rows.map(row=>({...row,print_server:null,printers_total:0,pending_jobs:0})));
   return send(rows);
  }
  if(name==='ps_panel_state') {
   if(db.mode==='panel-denied')return send({code:'42501'},403);
   const row=rows.find(row=>row.venue_id===args.p_venue_id);
   return send({venue_id:args.p_venue_id,can_manage:true,print_server:row.print_server,pending_enrollment:null,printers:[{id:'66666666-6666-4666-8666-666666666666',label:'Receipt printer',is_active:true,pending_jobs:1,workstations:[]}],last_scan:null});
  }
  if(name==='ps_panel_printer_jobs')return send({ok:true,jobs:[],total:0,limit:10,offset:0});
  throw new Error('Unexpected request '+name);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.pageErrors.push(e.message));
 return {ctx,page,db};
}
try {
 for (const locale of ['en','es']) {
  const {ctx,page}=await setup({width:390});
  await page.goto(origin+path(a));
  if(locale==='es')await page.getByRole('button',{name:'ES',exact:true}).click();
  const search=page.getByTestId('fleet-filter-search');
  await expect(search).toHaveAttribute('placeholder',locale==='es'?'Buscar Print Servers':'Search Print Servers');
  const count=(n,m)=>`${n} ${locale==='es'?'de':'of'} ${m} Print Servers`;
  await expect(page.getByTestId('fleet-count')).toHaveText(count(1,1));
  await expect(page.getByTestId(`fleet-row-${a}`)).toContainText('Receipt station');
  await expect(page.getByTestId(`fleet-row-${a}`)).not.toContainText('Harbor venue');
  for(const query of [' RECEIPT ', 'counter-host', 'serial-alpha', '44444444-4444-4444-8444-444444444440']) {
   await search.fill(query);await expect(page.getByTestId('fleet-count')).toHaveText(count(1,1));
   await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();
  }
  for(const query of ['Harbor venue','harbor','Garden','missing-device']) {
   await search.fill(query);await expect(page.getByTestId('fleet-count')).toHaveText(count(0,1));
   await expect(page.getByTestId('fleet-empty')).toHaveText(locale==='es'?'Ningún Print Server coincide con estos filtros.':'No Print Servers match these filters.');
   await expect(page.getByTestId(`fleet-row-${b}`)).toHaveCount(0);
  }
  await page.screenshot({path:`${out}/no-matches-390-${locale}.png`,fullPage:true});
  await page.getByTestId('fleet-filter-clear').click();
  await expect(page.getByTestId('fleet-count')).toHaveText(count(1,1));
  await page.getByTestId('fleet-filter-state').selectOption('offline');
  await expect(page.getByTestId('fleet-count')).toHaveText(count(0,1));
  await page.getByTestId('fleet-filter-clear').click();
  await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${out}/devices-390-${locale}.png`,fullPage:true});
  record(`${locale}: device label/id/hostname/device_id search, no venue-name/slug search, 1/1 and 0/1 PS counts, local state filter and clear, mobile identity without venue labels`);
  await ctx.close();
  for(const mode of ['empty','none','pending']) {
   const {ctx,page}=await setup({width:390,mode});await page.goto(origin+path(a));
   if(locale==='es')await page.getByRole('button',{name:'ES',exact:true}).click();
   await expect(page.getByTestId('fleet-count')).toHaveText(count(0,0));
   await expect(page.getByTestId('fleet-empty')).toHaveText(locale==='es'?'No hay Print Servers vinculados a este local.':'No Print Servers are linked to this venue.');
   await page.getByTestId('fleet-filter-search').fill('missing');
   await expect(page.getByTestId('fleet-empty')).toHaveText(locale==='es'?'No hay Print Servers vinculados a este local.':'No Print Servers are linked to this venue.');
   await expect(page.locator('[data-testid^="fleet-row-"]')).toHaveCount(0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(mode==='none')await page.screenshot({path:`${out}/no-linked-390-${locale}.png`,fullPage:true});
   record(`${locale}: ${mode} means no linked devices, 0/0 PS, including after search`);await ctx.close();
  }
 }
 for(const width of [1440,390]) {
  const {ctx,page,db}=await setup({width});
  await page.goto(origin+`/admin/tenants/${a}`);
  await page.getByTestId('venue-print-servers-tab').click();
  await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();
  await expect(page.getByTestId(`fleet-row-${b}`)).toHaveCount(0);
  await expect(page.getByTestId('fleet-filter-venue')).toHaveCount(0);
  assert.equal(await page.locator('.portal-layout').count(),1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`tab overflow ${width}`);
  await page.screenshot({path:`${out}/venue-tab-${width}.png`,fullPage:true});
  if(width===390) {await page.getByRole('button',{name:'ES',exact:true}).click();await expect(page.getByTestId('venue-print-servers-tab')).toHaveAttribute('aria-current','page');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/venue-tab-390-es.png`,fullPage:true});}
  await page.getByTestId(`fleet-open-${a}`).click();
  await expect(page.getByTestId('ps-detail')).toBeVisible();
  assert.equal(new URL(page.url()).pathname,path(a)+'/detail');
  assert(db.calls.some(c=>c.name==='ps_panel_state'&&c.args.p_venue_id===a));
  assert(!db.calls.some(c=>c.name==='ps_panel_state'&&c.args.p_venue_id===b));
  await page.locator('.ps-queue button[aria-expanded]').click();
  await expect(page.locator('.ps-queue button[aria-expanded]')).toHaveAttribute('aria-expanded','true');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`detail overflow ${width}`);
  await page.screenshot({path:`${out}/venue-detail-${width}.png`,fullPage:true});
  await page.locator('[data-testid="ps-detail"] .back-link').click();
  await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();
  await page.reload();await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();
  await page.goto(origin+path(b));await expect(page.getByTestId(`fleet-row-${b}`)).toBeVisible();await expect(page.getByTestId(`fleet-row-${a}`)).toHaveCount(0);
  record(`${width}px: only selected venue; existing detail and queue use that venue; return, reload and switching venue retain scope; no overflow`);
  await ctx.close();
 }
 {
  const {ctx,page}=await setup();await page.goto(origin+'/admin/print-servers/list');
  await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();await expect(page.getByTestId(`fleet-row-${b}`)).toBeVisible();
  await page.getByTestId('fleet-filter-search').fill('garden');await expect(page.getByTestId(`fleet-row-${b}`)).toBeVisible();await expect(page.getByTestId(`fleet-row-${a}`)).toHaveCount(0);
  await expect(page.getByTestId('fleet-filter-search')).toHaveAttribute('placeholder','Search by venue name or slug');
  await page.getByTestId('fleet-filter-search').fill('missing');await expect(page.getByTestId('fleet-empty')).toHaveText('No venues match these filters.');
  await page.getByRole('button',{name:'ES',exact:true}).click();await expect(page.getByTestId('fleet-empty')).toHaveText('Ningún local coincide con estos filtros.');
  await page.getByTestId('fleet-filter-clear').click();
  for(const name of ['search','venue','version','signal','state','printers'])await expect(page.getByTestId('fleet-filter-'+name)).toBeVisible();
  await page.getByTestId('fleet-filter-venue').selectOption(b);await expect(page.getByTestId(`fleet-row-${a}`)).toHaveCount(0);
  await page.getByTestId('fleet-filter-clear').click();await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();
  await page.getByTestId('fleet-filter-version').selectOption('2.4.1');await expect(page.getByTestId(`fleet-row-${b}`)).toHaveCount(0);
  await page.getByTestId(`fleet-open-${a}`).click();await expect(page.getByTestId('ps-detail')).toBeVisible();
  await expect(page.locator('[data-testid="ps-detail"] .back-link')).toHaveAttribute('href','/admin/print-servers');
  record('Global fleet remains available with all six filters, working venue/version/reset and original detail return');await ctx.close();
 }
 for(const mode of ['loading','empty','none','error','denied','tenant-denied','panel-denied']) {
  const {ctx,page,db}=await setup({width:390,mode});await page.goto(origin+path(a)+(mode==='panel-denied'?'/detail':''));
  if(mode==='loading') {await expect(page.locator('.state-loading')).toBeVisible();while(!db.release)await new Promise(r=>setTimeout(r,20));db.mode='ready';db.release();await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();}
  else if(mode==='empty') {await expect(page.getByTestId('fleet-empty')).toBeVisible();await expect(page.getByTestId(`fleet-row-${b}`)).toHaveCount(0);}
  else if(mode==='none') {await expect(page.getByTestId('fleet-empty')).toHaveText('No Print Servers are linked to this venue.');await expect(page.getByTestId('fleet-count')).toHaveText('0 of 0 Print Servers');}
  else if(mode==='error') {await expect(page.locator('.state-error')).toBeVisible();db.mode='ready';await page.locator('.state-error button').click();await expect(page.getByTestId(`fleet-row-${a}`)).toBeVisible();}
  else {await expect(page.locator('.state-denied')).toBeVisible();await expect(page.getByTestId('ps-detail')).toHaveCount(0);}
  assert.equal(await page.locator('.portal-layout').count(),1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(mode==='tenant-denied')assert(!db.calls.some(c=>c.name==='portal_ps_fleet'||c.name==='ps_panel_state'));
  record(`390px: ${mode} handled inside shell${mode==='error'?' with successful retry':''}`);await ctx.close();
 }
 for(const role of ['operations','support','owner']) {
  const {ctx,page,db}=await setup({role});
  for(const suffix of ['', '/detail']) {
   await page.goto(origin+path(a)+suffix);
   if(role==='owner')await expect(page.locator('.owner-venue-card')).toBeVisible();else await expect(page.locator('.state-denied')).toBeVisible();
   assert(!db.calls.some(c=>c.name==='portal_ps_fleet'||c.name==='ps_panel_state'));
  }
  if(role==='operations') {await page.goto(origin+`/admin/tenants/${a}`);await expect(page.getByRole('heading',{name:'Harbor venue',exact:true})).toBeVisible();await expect(page.getByTestId('venue-print-servers-tab')).toHaveCount(0);await expect(page.locator('.servers-table')).toContainText('legacy-summary-version');}
  record(`${role}: direct tab/detail do not mount Print Server queries; no widened access`);await ctx.close();
 }
 assert.deepEqual(report.pageErrors,[]);report.passed=true;
} finally {await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
