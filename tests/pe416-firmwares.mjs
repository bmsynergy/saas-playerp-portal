// PE-416 isolated UI contract checks. All external requests are intercepted; no live mutations.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.SMOKE_OUTPUT_DIR??'test-results/pe416';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',venueId='22222222-2222-4222-8222-222222222222';
const user={id:uid,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const date='2026-10-12T17:00:00Z';
const makeRelease=(i)=>({id:`release-${i}`,version:`0.3.${i}`,revision:'review-'+('long'.repeat(9)),model:'rpi4-2gb',arch:'arm64',filename:`firmware-${'long'.repeat(28)}-${i}.zip`,sha256:'a'.repeat(64),status:i===2?'rejected':'ready',notes:'Full width notes. '.repeat(30),created_at:date,uploaded_by_email:'fixture@example.invalid',size_bytes:1000000,installed_count:i===0?2:0});
const items=Array.from({length:4},(_,i)=>({id:`device-${i}`,device_id:`device-${i}`,label:`Print Server ${i}`,hostname:`fixture-${i}`,assignment:'assigned',venue_id:venueId,venue_name:'Fixture Venue',last_venue_name:null,connection:'online',last_seen_at:date,last_report_at:date,firmware_version:i<2?'0.3.0':i===2?'0.2.0':null,firmware_known:i<3,error_count:0,warning_count:0,printers_total:1,pending_jobs:0,last_issue_at:null,issues:[]}));
const target={id:'target-current',deployment_id:'deployment-current',print_server_id:'ps-0',hostname:'Print Server 0',venue_name:'Fixture Venue',status:'committed',phase:'committed',progress:100,desired_version:'0.3.0',installed_version:'0.2.0',issued_at:date,updated_at:date};
const events=Array.from({length:137},(_,i)=>({id:String(i),created_at:date,phase:i===136?'Future Phase!':'committed',status:'committed',progress:100,detail:{message:`Step ${i}`}}));
const report={origin,kind:'Synthetic isolated UI fixtures; live verification is separate',checks:[],errors:[]};
async function setup(width,lang='en'){
 const ctx=await browser.newContext({viewport:{width,height:950},locale:lang});await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
 const state={releases:[0,1,2].map(makeRelease),calls:[],deleteMode:'ok',deleted:0,hold:null,reads:0};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url()),name=url.pathname.split('/').pop();if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(url.pathname.endsWith('/user')?user:session);
  if(name==='staff_profiles')return send(null);
  const args=route.request().postDataJSON()??{};state.calls.push({name,args});
  if(name==='portal_access')return send({is_platform_staff:true,platform_role:'super_admin',owner_venues:[]});
  if(name==='is_platform_staff')return send(true);
  if(name==='portal_tenant_directory')return send([{id:venueId,name:'Fixture Venue',slug:'fixture',is_active:true}]);
  if(name==='portal_ps_inventory')return send({contract_version:1,generated_at:date,online_window_seconds:180,items});
  if(name==='ps_firmware_list'){state.reads++;return send({releases:state.releases,installed:[{version:'0.3.0',print_servers:2,uploaded:true},{version:'0.2.0',print_servers:1,uploaded:false}]});}
  if(name==='ps-firmware-admin'){
   assert.equal(args.action,'delete');assert.equal(route.request().headers().authorization,`Bearer ${session.access_token}`);
   state.deleted++;
   if(state.deleteMode==='hold')await new Promise(resolve=>state.hold=resolve);
   if(['installed','deployment_in_progress','not_found'].includes(state.deleteMode))return send({ok:false,error:state.deleteMode},state.deleteMode==='not_found'?404:409);
   state.releases=state.releases.filter(r=>r.id!==args.id);return send({ok:true,deleted:{id:args.id},file_removed:state.deleteMode!=='partial'});
  }
  if(name==='ps_ota_admin_overview')return send({ok:true,keys:[],releases:[],groups:[],devices:[{print_server_id:'ps-0',venue_id:venueId,venue_name:'Fixture Venue',hostname:'Print Server 0',installed_version:'0.3.0',online:true,last_seen_at:date,target}],deployments:[],audit:[]});
  if(name==='ps_ota_target_events'){assert.deepEqual(args,{p_target_id:'target-current'});return send({ok:true,events});}
  if(name==='ps_ota_admin_deployments_page'||name==='ps_ota_admin_audit_page')return send({ok:true,total:0,items:[],limit:25,offset:0,aggregates:{}});
  report.errors.push(`Unexpected endpoint ${name}`);return route.abort();
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));return {ctx,page,state};
}
async function controls(page){
 const values=await page.locator('[data-testid="firmwares-page"], [data-testid="updates-page"]').locator('select,input:not([type=file]):not([type=checkbox])').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>({height:el.getBoundingClientRect().height,testId:el.dataset.testid})));
 assert.ok(values.length>3);for(const v of values)assert.equal(v.height,44,JSON.stringify(v));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page must not overflow');return values.length;
}
try{
 for(const width of [390,834,1440]){
  const {ctx,page,state}=await setup(width);await page.goto(origin+'/admin/print-servers/firmwares');await expect(page.getByTestId('fw-row-release-0')).toBeVisible();
  const measured=await controls(page);await expect(page.getByTestId('fw-devices').locator(':scope > li')).toHaveCount(4);
  const segment=page.getByTestId('fw-segment-0.3.0');await expect(segment).toHaveAttribute('aria-label',/50%/);await segment.focus();await page.keyboard.press('Enter');await expect(page.getByTestId('fw-devices').locator(':scope > li')).toHaveCount(2);
  await page.locator('.fw-donut').scrollIntoViewIfNeeded();const arc=await page.locator('.fw-donut').boundingBox();await page.mouse.click(arc.x+arc.width*0.2313,arc.y+arc.height*0.2313);await expect(page.getByTestId('fw-devices').locator(':scope > li')).toHaveCount(1);
  await page.getByTestId('fw-clear-distribution').click();await expect(page.getByTestId('fw-devices').locator(':scope > li')).toHaveCount(4);
  const card=page.getByTestId('fw-row-release-0');assert.equal(await card.evaluate(el=>el.tagName),'LI');
  const facts=card.locator('.fw-release-facts'),notes=card.locator('.fw-release-notes');const fb=await facts.boundingBox(),nb=await notes.boundingBox();assert.ok(nb.width>=fb.width-2);assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await card.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/cards-${width}.png`});
  const reads=state.reads;
  await page.getByTestId('fw-delete-release-1').click();await expect(page.getByTestId('fw-delete-dialog')).toBeVisible();await page.keyboard.press('Escape');assert.equal(state.deleted,0);
  await page.getByTestId('fw-delete-release-1').click();state.deleteMode='hold';await page.getByTestId('fw-confirm-delete').click();await expect(page.getByTestId('fw-confirm-delete')).toBeDisabled();await expect.poll(()=>state.hold!==null).toBe(true);state.hold();await expect(page.getByTestId('fw-row-release-1')).toHaveCount(0);await expect(page.getByTestId('fw-delete-notice')).toBeVisible();assert.ok(state.reads>reads);
  for(const mode of ['installed','deployment_in_progress','not_found']){state.deleteMode=mode;await page.getByTestId('fw-delete-release-0').click();await page.getByTestId('fw-confirm-delete').click();await expect(page.getByTestId('fw-delete-error')).toBeVisible();await expect(page.getByTestId('fw-row-release-0')).toHaveCount(1);await page.keyboard.press('Escape');}
  state.deleteMode='partial';await page.getByTestId('fw-delete-release-2').click();await page.getByTestId('fw-confirm-delete').click();await expect(page.getByTestId('fw-row-release-2')).toHaveCount(0);await expect(page.getByTestId('fw-delete-notice')).toContainText(/file/i);
  await page.goto(origin+'/admin/print-servers/updates');await page.getByTestId('ota-events-toggle-target-current').click();await expect(page.getByTestId('ota-events-target-current').locator(':scope > li')).toHaveCount(137);await expect(page.getByTestId('events-target-current-pagination')).toHaveCount(0);await expect(page.getByTestId('ota-events-target-current')).toContainText('Future Phase!');await controls(page);
  await page.getByTestId('events-target-current-phase').fill('Future Phase!');await expect(page.getByTestId('ota-events-target-current').locator(':scope > li')).toHaveCount(1);
  report.checks.push({width,controls:measured,distribution:'50/25/25 with keyboard and pointer filters',cards:'multiline full-width notes, no overflow',delete:'cancel, pending, success, 409, 404 and partial cleanup',events:'137 complete, no paginator; local phase filter'});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));
}finally{await browser.close();}
