// PE-339: deterministic browser fixtures. NOT evidence of live backend permissions.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {X509Certificate,createHash} from 'node:crypto';
const pem=await readFile(new URL('./fixtures/certificate-ca.pem',import.meta.url),'utf8');
const fp=createHash('sha256').update(new X509Certificate(pem).raw).digest('hex');
const display=fp.toUpperCase().match(/../g).join(':');
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
const out=process.env.SMOKE_OUTPUT_DIR??'test-results/certificate';await mkdir(out,{recursive:true});
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
   return send({venue_id:v.id,can_manage:db.mode!=='readonly',print_server:db.mode==='empty'?null:{id:'ps-'+v.id,label:v.name+' Device',software_version:'1.2.3',status:'active',online:false,last_status:{note:'INTERNAL_NOTE'},ca_cert_available:db.mode!=='pending',ca_cert_status:db.mode==='pending'?'pending':'reported',ca_cert_der_sha256:db.mode==='changed'?'0'.repeat(64):fp,ca_cert_fingerprint:'PEM-HASH-NOT-DEVICE-FINGERPRINT'},printers:db.mode==='empty'?[]:[{id:'printer-'+v.id,label:v.name+' Printer',is_active:true,pending_jobs:0,workstations:[]}],last_scan:{command_id:'scan-fixture',status:'done',result:{candidates:[{mac_address:'AA:BB:CC:DD:EE:FF',model:'Test scanner',reachable:true}],count:1}}});
  }
  if(name==='ps_panel_ca_cert'){
   if(db.mode==='missing')return send({ok:false,error:'no_ca_cert_reported',ca_cert_status:'pending'});
   if(db.mode==='cert-denied')return send({code:'42501'},403);
   return send({ok:true,ca_cert_status:'reported',ca_cert_pem:pem,ca_cert_der_sha256:db.mode==='mismatch'?'0'.repeat(64):fp});
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
  const s=await setup({scope,locale});await s.open();
  await expect(s.page.getByTestId('ps-cert-fingerprint')).toHaveText(display);
  await s.page.getByTestId('ps-cert-guide').locator('summary').click();
  await expect(s.page.getByTestId('ps-cert-guide')).toContainText(locale==='es'?'Después activa la confianza total':'full trust');
  assert(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const download=s.page.waitForEvent('download');await s.page.getByTestId('ps-cert-download').click();
  const file=await download;assert.equal(file.suggestedFilename(),`playerp-${A}-ca.crt`);
  assert.equal(await readFile(await file.path(),'utf8'),pem);
  assert(s.db.calls.some(c=>c.name==='ps_panel_ca_cert'&&c.body.p_venue_id===A));
  await s.page.locator('.ps-cert-panel').screenshot({path:`${out}/${scope}-${locale}-390.png`});
  record(`${scope} ${locale}: identical downloaded PEM, venue-specific .crt filename, DER fingerprint, installation/trust guide, 390px without overflow (fixture)`);
  await s.ctx.close();
 }
 for(const mode of ['pending','missing','mismatch','cert-denied','changed']){
  const s=await setup({mode});await s.open();
  let downloads=0;s.page.on('download',()=>downloads++);
  if(mode==='pending'){
   await expect(s.page.getByTestId('ps-cert-pending')).toBeVisible();await expect(s.page.getByTestId('ps-cert-download')).toHaveCount(0);
  }else{
   await s.page.getByTestId('ps-cert-download').click();
   if(mode==='missing'){await expect(s.page.getByTestId('ps-cert-pending')).toBeVisible();await expect(s.page.getByTestId('ps-cert-download')).toHaveCount(0);}
   if(mode==='mismatch')await expect(s.page.getByTestId('action-result')).toHaveAttribute('data-ok','false');
   if(mode==='cert-denied')await expect(s.page.getByTestId('action-result')).toHaveAttribute('data-ok','false');
   if(mode==='changed'){await expect(s.page.getByTestId('ps-cert-changed')).toContainText(display);assert.equal(downloads,1);}
  }
  if(mode!=='changed')assert.equal(downloads,0);
  record(`${mode}: safe UI response and expected download count (fixture)`);await s.ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
