// PE-437 UI verification. Every non-local request is intercepted; no device mutations.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {readFileSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
const ca=createHash('sha256').update(new X509Certificate(readFileSync(new URL('./fixtures/legacy-ca.pem',import.meta.url))).raw).digest('hex');
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PS_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.PS_TEST_EVIDENCE??'docs/evidence/pe437-ux';await mkdir(out,{recursive:true});
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
  if(name==='ps_admin_device_detail'){if(state.holdDetail)await new Promise(resolve=>state.releaseDetail=resolve);return state.firmwareError?send({code:'XX000'},500):send({ok:true,device:{...device,arch:'arm64',venue_id:venueId},update:{current_version:state.installed,latest_stable:{edition_id:'stable',version:state.latest,model:device.model,arch:'arm64'},update_available:state.updateAvailable,reason:null,active_update:null},delete:{allowed:false,blockers:['assigned']}});}
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
  if(name==='ps_panel_ota')return state.firmwareError?send({code:'XX000'},500):send({ok:true,print_servers:[{print_server_id:ps.id,hostname:ps.hostname,installed_version:state.installed,status:'none',model:device.model,arch:'arm64',update:{current_version:state.installed,latest_stable:{edition_id:'stable',version:state.latest,model:device.model,arch:'arm64'},update_available:true,reason:null}}]});
  if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
  if(name==='portal_owner_venues')return send(owner?[venue]:[]);
  return send(null);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(owner?`${origin}/?section=print-servers&venue=${venueId}&lang=${lang}`:`${origin}/admin/print-servers/${venueId}?lang=${lang}`);await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);
 return {ctx,page,state};
}
function luminance(rgb){const c=rgb.match(/\d+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
async function verifyDisabled(page){
 const all=page.locator('button:disabled');assert.ok(await all.count()>0);
 for(const b of await all.all()){
  if(!await b.isVisible())continue;
  await b.hover({force:true});
  const style=await b.evaluate(el=>{const s=getComputedStyle(el);return {color:s.color,bg:s.backgroundColor,cursor:s.cursor,animation:s.animationName,disabled:el.matches(':disabled'),ancestorOpacity:(()=>{let n=el,opacity=1;while(n){opacity*=Number(getComputedStyle(n).opacity);n=n.parentElement;}return opacity;})()};});
  assert.ok(style.disabled);assert.equal(style.ancestorOpacity,1);assert.equal(style.cursor,'not-allowed');assert.equal(style.animation,'none');
  assert.ok((luminance(style.bg)+.05)/(luminance(style.color)+.05)>=4.5,JSON.stringify(style));
 }
}
async function screenshot(page,name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});}
try{
 for(const owner of [false,true])for(const width of [390,1440])for(const lang of ['en','es']){
  const {ctx,page,state}=await setup(width,lang,owner);
  await expect(page.getByTestId('ps-https-panel')).toHaveCount(1);
  await expect(page.getByTestId('ps-cert-download')).toHaveCount(1);
  await expect(page.getByTestId('https-none')).toBeVisible();
  await page.getByTestId('printers-toggle').click();await expect(page.getByTestId('printers-search')).toBeVisible();
  await expect(page.getByTestId('dev-label-disabled')).toBeVisible();
  if(owner){await expect(page.getByTestId('legacy-reconcile')).toHaveCount(0);await expect(page.getByTestId('https-renew')).toHaveCount(0);await expect(page.getByTestId('ps-ota-latest')).toHaveText('0.3.10');assert.ok(!state.readCalls.includes('ps_admin_device_detail'));assert.ok(!state.readCalls.includes('ps_admin_legacy_credentials_context'));}
  else{
   await expect(page.getByTestId('legacy-reconcile')).toBeVisible();
   const order=await page.evaluate(()=>!!(document.querySelector('[data-testid="legacy-reconcile"]').compareDocumentPosition(document.querySelector('[data-testid="dev-label"]'))&Node.DOCUMENT_POSITION_FOLLOWING));assert.ok(order);
   await page.getByTestId('dev-credentials-missing-wifi').getByRole('link').click();
   await expect(page.locator('#legacy-reconcile-title')).toBeFocused();
   await expect(page.getByTestId('dev-rotate-wifi')).toBeDisabled();
   await expect(page.getByTestId('admin-device-update')).toBeEnabled();
   await page.getByTestId('admin-device-update').click();await expect(page.locator('.admin-device-confirm')).toContainText('0.3.9');await expect(page.locator('.admin-device-confirm')).toContainText('0.3.10');
   await page.locator('.admin-device-confirm button').last().click();
  }
  await verifyDisabled(page);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${owner} ${width} ${lang}`);
  const controls=await page.locator('.ps-printers-filters input,.ps-printers-filters select').evaluateAll(es=>es.map(e=>({height:e.getBoundingClientRect().height,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,bottom:e.getBoundingClientRect().bottom})));
  assert.ok(controls.every(c=>c.x>=0&&c.right<=width));assert.ok(controls.every(c=>Math.abs(c.height-controls[0].height)<=2),JSON.stringify(controls));
  if(width===1440)assert.ok(controls.every(c=>Math.abs(c.bottom-controls[0].bottom)<=2),JSON.stringify(controls));
  assert.equal(state.commands.length,0);
  await screenshot(page,`${owner?'owner':'admin'}-${width}-${lang}`);
  checks.push(`visual DOM ${owner?'owner':'admin'} ${width} ${lang}: one HTTPS block, CA/leaf, permissions, disabled contrast >=4.5, navigation, filters, no overflow, zero mutations`);
  await ctx.close();
 }
 const {ctx,page,state}=await setup(390,'es',false);
 const wifiForm=page.getByTestId('legacy-wifi-form'),codeForm=page.getByTestId('legacy-admin_code-form');
 await page.getByTestId('legacy-wifi-ssid').fill('Test physical Wi-Fi');await page.getByTestId('legacy-wifi-psk').fill('0123456789');
 await page.getByTestId('legacy-admin_code-code').fill('ABCD234567');await page.getByTestId('legacy-admin_code-fingerprint').fill(ca);await page.getByTestId('legacy-admin_code-check').check();
 await page.getByTestId('legacy-wifi-fingerprint').fill('860C3ADC5BA3115D');await expect(page.getByTestId('legacy-wifi-fingerprint-format')).toContainText('12');await expect(page.getByTestId('legacy-wifi-fingerprint-format')).toContainText('64');
 await expect(page.getByTestId('legacy-wifi-submit')).toBeDisabled();assert.equal(state.commands.length,0);
 await page.getByTestId('legacy-wifi-fingerprint').fill('0'.repeat(12));await expect(page.getByTestId('legacy-wifi-fingerprint-mismatch')).toBeVisible();
 await page.getByTestId('legacy-wifi-fingerprint').fill('  '+ca.slice(0,12).toUpperCase().match(/../g).join(':')+'  ');
 await expect(page.getByTestId('legacy-wifi-submit')).toBeDisabled();await page.getByTestId('legacy-wifi-check').check();
 state.holdReconcile=true;await page.getByTestId('legacy-wifi-submit').click();await expect(wifiForm.getByRole('status')).toContainText('Enviando');
 await expect(page.getByTestId('legacy-wifi-submit')).toBeDisabled();await expect(page.getByTestId('legacy-admin_code-code')).toHaveValue('ABCD234567');await expect(page.getByTestId('legacy-admin_code-check')).toBeChecked();
 await expect.poll(()=>!!state.releaseReconcile).toBe(true);state.releaseReconcile();
 await expect(page.getByTestId('legacy-wifi-ssid')).toHaveCount(0);await expect(page.getByTestId('legacy-wifi-confirmed')).toBeVisible();
 assert.equal(state.commands[0].p_ca_der_sha256,ca);assert.equal(state.commands[0].p_physical_check,true);
 state.holdReconcile=false;await page.getByTestId('legacy-admin_code-submit').click();await expect(page.getByTestId('legacy-reconcile')).toHaveCount(0);
 assert.equal(state.commands.length,2);assert.equal(state.commands[1].p_kind,'admin_code');
 checks.push('UI reconciliation: malformed 16 vs mismatch, explicit check, prefix pairs, full64 independent code, separate loading/result, confirmed form removed and completed block hidden; only two intercepted writes');
 await ctx.close();
 // Shared non-PS form, using the same global native disabled styling.
 const other=await setup(390,'en',false);await other.page.goto(`${origin}/auth/password`);
 await other.page.locator('input[type=password]').nth(0).fill('SyntheticOnlyPassword123');await other.page.locator('input[type=password]').nth(1).fill('SyntheticOnlyPassword123');
 await other.page.locator('.auth-submit').click();await expect(other.page.locator('.auth-submit')).toBeDisabled();
 await expect(other.page.locator('.auth-form > [role=status]')).toBeVisible();await verifyDisabled(other.page);
 // Native disabled controls reject mouse and keyboard activation while a real request is pending.
 await other.page.locator('.auth-submit').click({force:true});await other.page.keyboard.press('Enter');assert.equal(other.state.authWrites,1);
 await expect.poll(()=>!!other.state.releaseAuth).toBe(true);other.state.releaseAuth();await expect(other.page.locator('.auth-success')).toBeVisible();await other.ctx.close();
 checks.push('Shared non-PS password form: disabled semantic, readable grey, separate accessible loading, mouse/keyboard cannot duplicate intercepted request');
 assert.deepEqual(errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify({checks,errors,backend:'all intercepted; pending Tom contract, no real device operations'},null,2));console.log(checks.join('\n'));
}finally{await browser.close();}
