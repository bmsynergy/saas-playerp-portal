// PE-336: rare UI states, deterministic intercepted fixtures. Not evidence of live permissions.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
const out=process.env.SMOKE_OUTPUT_DIR??'test-results/owner-venue-states';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const A='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333',U='11111111-1111-4111-8111-111111111111';
const venues=[{id:A,name:'Harbor',slug:'harbor',is_owner:true,is_active:true},{id:B,name:'Garden',slug:'garden',is_owner:true,is_active:true}];
const user={id:U,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-02T00:00:00Z'};
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),exp=Math.floor(Date.now()/1000)+3600;
const session={user,access_token:`${enc({alg:'HS256'})}.${enc({sub:U,exp,aud:'authenticated',role:'authenticated',session_id:U})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer'};
const report={origin,mocks:true,checks:[],errors:[]};
function record(s){report.checks.push(s);console.log('PASS '+s);}
async function setup({scope='owner',mode='ready',locale='en',width=390}={}){
 const ctx=await browser.newContext({viewport:{width,height:900},locale});
 await ctx.addInitScript(({session,locale})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.portal.locale',locale);},{session,locale});
 const db={mode,calls:[]};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url()),name=url.pathname.split('/').pop();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
  if(url.pathname==='/rest/v1/staff_profiles')return send(null);
  const body=route.request().postDataJSON()??{};db.calls.push({name,body});
  if(name==='is_platform_staff')return send(scope==='admin');
  if(name==='portal_access')return send({is_platform_staff:scope==='admin',platform_role:scope==='admin'?'super_admin':null,owner_venues:scope==='owner'?venues:[]});
  if(name==='portal_owner_venues')return send(venues.filter(v=>v.id===body.p_venue_id));
  if(name==='portal_tenant_detail')return send({venue:venues.find(v=>v.id===body.p_venue_id),print_servers:[]});
  if(name==='ps_panel_state'){
   if(db.mode==='loading')await new Promise(resolve=>db.release=resolve);
   if(db.mode==='error')return send({code:'XX000'},500);
   if(db.mode==='denied')return send({code:'42501'},403);
   const v=venues.find(v=>v.id===body.p_venue_id);
   return send({venue_id:v.id,can_manage:db.mode!=='readonly',print_server:db.mode==='empty'?null:{id:'ps-'+v.id,label:v.name+' Device',software_version:'1.2.3',status:'active',online:false,last_status:{note:'INTERNAL_NOTE'}},printers:db.mode==='empty'?[]:[{id:'printer-'+v.id,label:v.name+' Printer',is_active:true,pending_jobs:0,workstations:[]}],last_scan:{command_id:'scan-fixture',status:'done',result:{candidates:[{mac_address:'AA:BB:CC:DD:EE:FF',model:'Test scanner',reachable:true}],count:1}}});
  }
  if(name==='ps_panel_printer_jobs')return db.mode==='queue-error'?send({code:'XX000'},500):send({ok:true,jobs:[],total:0,limit:10,offset:0});
  if(name==='owner-venue-users'||name==='platform-identity-admin'){
   if(db.mode==='users-error')return send({error:'server_error'},500);
   if(db.mode==='users-denied')return send({error:'forbidden'},403);
   const v=venues.find(v=>v.id===body.venue_id);return send({venue:v,users:db.mode==='users-empty'?[]:[{user_id:U,email:v.name+'@example.invalid',full_name:v.name+' User',role:'front_desk',status:'active',portal_access:true,locked:null,is_self:false}],roles:['front_desk']});
  }
  report.errors.push('Unexpected request '+name);return send({code:'unexpected'},500);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 async function open(section='ps'){
  await page.goto(origin+(scope==='owner'?`/?venue=${A}`:`/admin/tenants/${A}/${section==='ps'?'print-servers/detail':'users'}`));
  if(scope==='owner')await page.getByTestId(section==='ps'?'venue-print-servers-tab':'venue-users-tab').click();
 }
 return {ctx,page,db,open};
}
try{
 for(const scope of ['owner','admin'])for(const locale of ['en','es']){
  for(const mode of ['loading','error','empty','readonly']){
   const s=await setup({scope,locale,mode});await s.open();
   if(mode==='loading'){await expect(s.page.locator('.state-loading')).toBeVisible();await expect.poll(()=>typeof s.db.release).toBe('function');s.db.mode='ready';s.db.release();await expect(s.page.getByTestId('ps-detail')).toBeVisible();}
   if(mode==='error'){await expect(s.page.locator('.state-error')).toBeVisible();s.db.mode='ready';await s.page.locator('.state-error button').click();await expect(s.page.getByTestId('ps-detail')).toBeVisible();}
   if(mode==='empty'){await expect(s.page.getByTestId('ps-detail')).toBeVisible();await s.page.getByTestId('printers-toggle').click();await expect(s.page.getByTestId('printers-empty')).toBeVisible();}
   if(mode==='readonly'){await expect(s.page.getByTestId('ps-read-only')).toBeVisible();await s.page.getByTestId('printers-toggle').click();await expect(s.page.getByTestId('printer-add')).toHaveCount(0);await expect(s.page.getByTestId('ps-scan')).toHaveCount(0);await expect(s.page.getByTestId('ps-assign')).toHaveCount(0);}
   assert(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(scope==='owner'){assert(!s.db.calls.some(c=>c.name.startsWith('portal_ps_')||c.name.startsWith('platform-')));await expect(s.page.getByTestId('ps-detail')).not.toContainText('INTERNAL_NOTE');}
   record(`${scope} ${locale}: ${mode}, mobile, localized UI`);await s.ctx.close();
  }
  for(const mode of ['users-empty','users-error']){
   const s=await setup({scope,locale,mode});await s.open('users');
   await expect(s.page.locator(mode==='users-empty'?'.staff-empty':'.state-error')).toBeVisible();record(`${scope} ${locale}: ${mode}`);await s.ctx.close();
  }
 }
 const s=await setup();await s.open('users');await s.page.getByTestId('venue-users-search').fill('Garden');await expect(s.page.getByTestId('venue-users-no-results')).toBeVisible();
 await s.page.locator('.venue-select select').selectOption(B);await expect(s.page.getByTestId('owner-users')).toHaveCount(0);await s.page.getByTestId('venue-users-tab').click();await expect(s.page.getByTestId('venue-users-search')).toHaveValue('');await expect(s.page.getByTestId('owner-user-row')).toContainText('Garden User');
 await s.page.getByTestId('venue-print-servers-tab').click();await expect(s.page.getByTestId('ps-detail')).toContainText('Garden Device');
 await s.page.getByTestId(`queue-toggle-printer-${B}`).click();await expect(s.page.getByTestId(`queue-empty-printer-${B}`)).toBeVisible();
 s.db.mode='queue-error';await s.page.getByTestId(`queue-refresh-printer-${B}`).click();await expect(s.page.getByTestId(`queue-error-printer-${B}`)).toBeVisible();
 record('User search is venue-local and resets on venue switch; queue empty and retry error supported');await s.ctx.close();
 const scan=await setup();await scan.open();await expect(scan.page.getByTestId('printers-toggle')).toHaveAttribute('aria-expanded','false');
 await scan.page.getByTestId('scan-add-AA:BB:CC:DD:EE:FF').click();await expect(scan.page.getByTestId('printer-form')).toBeVisible();await expect(scan.page.getByTestId('printer-form-mac')).toHaveValue('AA:BB:CC:DD:EE:FF');
 record('Add from scan opens collapsed printer form and preserves discovered address');await scan.ctx.close();
 // A denied background panel refetch must remove the previously rendered data.
 const revoked=await setup();await revoked.open();await expect(revoked.page.getByTestId('ps-detail')).toBeVisible();revoked.db.mode='denied';
 await expect(revoked.page.locator('.state-denied')).toBeVisible({timeout:15000});await expect(revoked.page.getByTestId('ps-detail')).toHaveCount(0);record('Revoked panel permission fails closed after background refetch');await revoked.ctx.close();
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
