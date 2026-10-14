// PE-441 style verification. Every non-local request is intercepted; no device mutations.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {readFileSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
const ca=createHash('sha256').update(new X509Certificate(readFileSync(new URL('./fixtures/legacy-ca.pem',import.meta.url))).raw).digest('hex');
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PS_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.PS_TEST_EVIDENCE??'docs/evidence/pe441/styles';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',venueId='22222222-2222-4222-8222-222222222222';
const user={id:uid,email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const device={id:'fixture-device',serial:'PS-XXXXXXXX',hostname:'playerp-ps-xxxxxxxx',model:'rpi4-2gb',status:'assigned',legacy:false};
const wifi={ssid:'W'.repeat(28)+';:"\\',psk:'0123456789',admin_code:'ABCD234567',wifi_applied_at:'2026-01-01T00:00:00Z',admin_code_applied_at:'2026-01-01T00:00:00Z'};
const venue={id:venueId,name:'Synthetic venue · PE-411',slug:'synthetic',is_active:true};
const ps={id:'fixture-ps',label:'Synthetic Print Server',hostname:device.hostname,device_id:device.id,status:'active',software_version:'0.3.15',online:true,last_seen_at:'2026-01-01T00:00:00Z'};
const fleet=[{venue_id:venueId,venue_name:venue.name,venue_slug:venue.slug,venue_is_active:true,print_server:ps,pending_enrollment:null,printers_total:0,printers_active:0,printers_paused:0,printers_with_error:0,pending_jobs:0}];
const checks=[],errors=[];
async function setup(width,lang='en',owner=false){
 const ctx=await browser.newContext({viewport:{width,height:960},locale:lang==='es'?'es-ES':'en-US',permissions:['clipboard-read','clipboard-write']});
 await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
 const state={legacy:true,firmwareError:false,installed:'0.3.9',updateAvailable:true,latest:'0.3.10',holdDetail:false,readCalls:[],sheet:{ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:{...device,legacy:true},ps_online:true,wifi:{...wifi,wifi_applied_at:null,admin_code_applied_at:null},rotations:[],cert:{},cert_operations:[],can_manage:true,is_platform_admin:!owner},reads:0,created:false,assigned:false,commands:[],mode:"ok",release:null};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const name=url.pathname.split('/').pop(),send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname==='/auth/v1/user'&&route.request().method()==='PUT'){state.authWrites=(state.authWrites??0)+1;await new Promise(resolve=>state.releaseAuth=resolve);return send(user);}
  if(url.pathname.startsWith('/auth/v1/'))return send(url.pathname.endsWith('/user')?user:session);
  const args=route.request().postDataJSON()??{};state.readCalls.push(name);
  if(name==='ps_admin_device_detail'){if(state.holdDetail)await new Promise(resolve=>state.releaseDetail=resolve);return state.firmwareError?send({code:'XX000'},500):send({ok:true,device:{...device,arch:'arm64',venue_id:venueId},update:{current_version:state.installed,latest_stable:state.latest?{edition_id:'stable',version:state.latest,model:device.model,arch:'arm64'}:null,update_available:state.updateAvailable,reason:state.latest?null:'no_stable_release',active_update:null},delete:{allowed:false,blockers:['assigned']}});}
  if(name==='ps-ota-admin'){state.commands.push(args);return send({ok:true,deployment_id:'fixture-deployment'});}
  if(name==='ps_admin_legacy_credentials_reconcile'){state.commands.push(args);if(state.holdReconcile)await new Promise(resolve=>state.releaseReconcile=resolve);if(args.p_kind==='wifi')state.sheet.wifi.wifi_applied_at=wifi.wifi_applied_at;else state.sheet.wifi.admin_code_applied_at=wifi.admin_code_applied_at;return send({ok:true,applied_at:wifi.wifi_applied_at});}
  if(name==='ps_panel_printer_jobs')return send({jobs:[],total:0});
  if(name==='staff_profiles')return send(null);
  if(name==='is_platform_staff')return send(!owner);
  if(name==='portal_access')return send({is_platform_staff:!owner,platform_role:owner?null:'super_admin',owner_venues:owner?[venue]:[]});
  if(name==='portal_tenant_directory')return send([venue]);
  if(name==='portal_ps_fleet')return send(fleet);
  if(name==='portal_ps_devices')return send({devices:[{...device,venue_id:venueId,venue_name:venue.name,print_server_id:ps.id,created_at:wifi.wifi_applied_at},...(state.created?[{...device,id:'fixture-new',serial:'PS-YYYYYYYY',status:'stock',venue_id:null,created_at:wifi.wifi_applied_at}]:[])]});
  if(name==='ps_admin_device_create'){state.created=true;return send({ok:true,device:{...device,id:'fixture-new',serial:'PS-YYYYYYYY',status:'stock'}});}
  if(name==='ps_admin_device_assign'){assert.equal(args.p_device_id,'fixture-new');assert.equal(args.p_venue_id,venueId);state.assigned=true;return send({ok:true,enrollment_code:'pse_SYNTHETIC_ONE_USE_ONLY',expires_at:'2026-12-01T00:00:00Z'});}
  if(['ps_panel_state','ps_panel_device','ps_panel_recovery_label','ps_panel_rotate_wifi','ps_panel_rotate_admin_code'].includes(name)) assert.equal(args.p_venue_id,venueId,'All PS requests must stay within the selected owned venue');
  if(name==='ps_panel_state')return send({venue_id:venueId,can_manage:true,print_server:{...ps,ca_cert_status:'reported',ca_cert_available:true,ca_cert_der_sha256:ca},printers:[{id:'printer',label:'Front desk',model:'Thermal',mac_address:'00:11:22:33:44:55',is_active:true,pending_jobs:0,workstations:[],last_report_at:'2026-10-01T00:00:00Z'}],pending_enrollment:null,last_scan:null});
  if(name==='ps_panel_rotate_wifi'||name==='ps_panel_rotate_admin_code'){
   assert.equal(args.p_venue_id,venueId);const kind=name.endsWith('_wifi')?'wifi':'admin_code',command_id='controlled-'+kind+'-'+(state.commands.length+1);
   state.commands.push({kind,command_id});
   if(state.mode==='hold')await new Promise(resolve=>state.release=resolve);
   if(state.mode==='fail')return send({ok:false,error:state.errorCode??'device_offline'});
   if(state.mode==='lost')return route.abort('failed');
   if(state.mode==='missing')return send({ok:true});
   return send({ok:true,command_id:state.existingId??command_id,already:!!state.existingId});
  }
  if(name==='ps_panel_recovery_label')return send({ok:true,label_version:1,ready:!!state.sheet.wifi?.wifi_applied_at,missing:state.sheet.wifi?.wifi_applied_at?[]:['wifi_not_confirmed'],wifi_rotation_pending:state.sheet.rotations.some(o=>o.kind==='wifi'&&o.status==='pending'),label:{device_id:device.id,serial:device.serial,ssid:state.sheet.wifi?.ssid,psk:state.sheet.wifi?.psk,wifi_applied_at:state.sheet.wifi?.wifi_applied_at}});
  if(name==='ps_admin_legacy_credentials_context')return owner||state.noLegacy?send({code:'42501'},403):send({ok:true,venue_id:venueId,device_id:device.id,serial:device.serial,legacy:state.legacy,print_server_id:ps.id,print_server_status:'active',ca_der_sha256:ca,wifi_confirmed:!!state.sheet.wifi?.wifi_applied_at,admin_code_confirmed:!!state.sheet.wifi?.admin_code_applied_at});
  if(name==='ps_panel_device'){state.reads++;if(state.holdRead)await new Promise(resolve=>state.releaseRead=resolve);if(state.readError)return send({code:state.readError==='denied'?'42501':'XX000',message:'Synthetic read error'},state.readError==='denied'?403:500);return send(state.sheet);}
  if(name==='ps_panel_ota')return state.firmwareError?send({code:'XX000'},500):send({ok:true,print_servers:[{print_server_id:ps.id,hostname:ps.hostname,installed_version:state.installed,status:'none',model:device.model,arch:'arm64',update:{current_version:state.installed,latest_stable:state.latest?{edition_id:'stable',version:state.latest,model:device.model,arch:'arm64'}:null,update_available:!!state.latest,reason:state.latest?null:'no_stable_release'}}]});
  if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
  if(name==='portal_owner_venues')return send(owner?[venue]:[]);
  return send(null);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(owner?`${origin}/?section=print-servers&venue=${venueId}&lang=${lang}`:`${origin}/admin/print-servers/${venueId}?lang=${lang}`);await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);
 return {ctx,page,state};
}
const styles=[];
function luminance(rgb){const c=rgb.match(/\d+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
async function verifyDisabled(page,scope){
 const buttons=page.locator('button:disabled');let count=0;
 for(const b of await buttons.all()){
  if(!await b.isVisible())continue;
  await b.hover({force:true});
  const value=await b.evaluate(el=>{const s=getComputedStyle(el);return {text:el.textContent,color:s.color,background:s.backgroundColor,cursor:s.cursor,disabled:el.matches(':disabled'),animation:s.animationName,children:[...el.querySelectorAll('*')].map(n=>({cursor:getComputedStyle(n).cursor,animation:getComputedStyle(n).animationName}))};});
  assert.equal(value.disabled,true);assert.equal(value.cursor,'default');assert.equal(value.animation,'none');
  assert.ok(value.children.every(c=>c.cursor==='default'&&c.animation==='none'));
  value.contrast=(luminance(value.background)+.05)/(luminance(value.color)+.05);assert.ok(value.contrast>=4.5);
  styles.push({scope,...value});count++;
 }
 assert.ok(count>0);
}
try{
 for(const owner of [false,true])for(const width of [390,1440]){
  const {ctx,page,state}=await setup(width,'en',owner);
  state.latest=null;state.updateAvailable=false;state.sheet.wifi={...wifi};
  state.sheet.rotations=[{command_id:'synthetic-wifi',kind:'wifi',status:'applied',requested_at:'2026-01-01T00:00:00Z',completed_at:'2026-01-01T00:01:00Z'}];
  await page.reload();
  const action=page.locator(owner?'[data-testid=ps-ota-block] .firmware-update-action':'.admin-device-summary .firmware-update-action');
  await expect(action.getByRole('button')).toBeDisabled();
  await expect(action).toContainText('No compatible signed stable firmware is available');
  await verifyDisabled(page,`${owner?'owner':'admin'}-${width}`);
  const spacing=await action.evaluate(el=>{const button=el.querySelector('button'),p=el.querySelector('p');return {gap:getComputedStyle(el).rowGap,pixels:p.getBoundingClientRect().top-button.getBoundingClientRect().bottom,explanation:p.textContent,outside:!button.contains(p)};});
  assert.equal(spacing.gap,'10px');assert.equal(spacing.pixels,10);assert.ok(spacing.outside);
  assert.ok(spacing.explanation.includes('No compatible signed stable firmware is available'));
  const progress=page.getByTestId('dev-rotation-status-wifi');await expect(progress).toHaveAttribute('data-phase','applied');await expect(progress.getByRole('button')).toHaveCount(0);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({fullPage:true,clip:await page.getByTestId('ps-device-panel').boundingBox(),path:`${out}/${owner?'owner':'admin'}-${width}-credentials.png`});
  await action.screenshot({path:`${out}/${owner?'owner':'admin'}-${width}-firmware.png`});
  assert.equal(state.commands.length,0);
  checks.push({scope:owner?'owner':'admin',width,spacing,appliedButtons:0});
  // Logout deliberately clears private state immediately. Probe its existing DOM disabled styling
  // directly; request/keyboard blocking and separate loading are covered by the password form below.
  await page.locator('.account-trigger').click();
  await page.locator('.account-popover-footer button').evaluate(button=>button.disabled=true);
  await verifyDisabled(page,`popover-css-probe-${owner?'owner':'admin'}-${width}`);
  await ctx.close();
 }
 // A separate actual form confirms semantic mouse/keyboard blocking during an intercepted request.
 for(const width of [390,1440]){
  const {ctx,page,state}=await setup(width,'en');await page.goto(`${origin}/auth/password`);
  await page.locator('input[type=password]').nth(0).fill('SyntheticOnlyPassword123');await page.locator('input[type=password]').nth(1).fill('SyntheticOnlyPassword123');
  await page.locator('.auth-submit').click();await expect(page.locator('.auth-submit')).toBeDisabled();await expect(page.locator('.auth-form > [role=status]')).toBeVisible();
  await verifyDisabled(page,`password-${width}`);
  await page.locator('.auth-submit').click({force:true});await page.keyboard.press('Enter');assert.equal(state.authWrites,1);
  await expect.poll(()=>!!state.releaseAuth).toBe(true);state.releaseAuth();await expect(page.locator('.auth-success')).toBeVisible();await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({synthetic:true,externalRequestsIntercepted:true,checks,styles,errors},null,2));console.log(JSON.stringify({ok:true,checks,disabledStyles:styles.length}));
}finally{await browser.close();}
