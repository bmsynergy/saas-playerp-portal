// PE-411: synthetic local fixtures, all external requests intercepted. No live authorization claim.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PS_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.PS_TEST_EVIDENCE??'docs/evidence/pe439';await mkdir(out,{recursive:true});
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
const checks=[],errors=[],queryCounts=[];
async function setup(width,lang='en',owner=false){
 const ctx=await browser.newContext({viewport:{width,height:960},locale:lang==='es'?'es-ES':'en-US',permissions:['clipboard-read','clipboard-write']});
 await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
 const state={sheet:{ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:{...device,legacy:true},ps_online:true,wifi:{...wifi,wifi_method:'recovery_read_and_join',admin_code_method:'local_login'},rotations:[],cert:{},cert_operations:[],can_manage:true,is_platform_admin:!owner},labelReads:0,reconciled:[],reads:0,created:false,assigned:false,commands:[],mode:"ok",release:null};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const name=url.pathname.split('/').pop(),send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(url.pathname.endsWith('/user')?user:session);
  const args=route.request().postDataJSON()??{};
  if(name==='staff_profiles')return send(null);
  if(name==='is_platform_staff')return send(!owner);
  if(name==='portal_access')return send({is_platform_staff:!owner,platform_role:owner?null:'super_admin',owner_venues:owner?[venue]:[]});
  if(name==='portal_tenant_directory')return send([venue]);
  if(name==='portal_ps_fleet')return send(fleet);
  if(name==='portal_ps_devices')return send({devices:[{...device,venue_id:venueId,venue_name:venue.name,print_server_id:ps.id,created_at:wifi.wifi_applied_at},...(state.created?[{...device,id:'fixture-new',serial:'PS-YYYYYYYY',status:'stock',venue_id:null,created_at:wifi.wifi_applied_at}]:[])]});
  if(name==='ps_admin_device_create'){state.created=true;return send({ok:true,device:{...device,id:'fixture-new',serial:'PS-YYYYYYYY',status:'stock'}});}
  if(name==='ps_admin_device_assign'){assert.equal(args.p_device_id,'fixture-new');assert.equal(args.p_venue_id,venueId);state.assigned=true;return send({ok:true,enrollment_code:'pse_SYNTHETIC_ONE_USE_ONLY',expires_at:'2026-12-01T00:00:00Z'});}
  if(name==='ps_panel_state')return send({venue_id:venueId,can_manage:true,print_server:ps,printers:[],pending_enrollment:null,last_scan:null});
  if(name==='ps_panel_rotate_wifi'||name==='ps_panel_rotate_admin_code'){
   assert.equal(args.p_venue_id,venueId);const kind=name.endsWith('_wifi')?'wifi':'admin_code',command_id='controlled-'+kind+'-'+(state.commands.length+1);
   state.commands.push({kind,command_id});
   if(state.mode==='hold')await new Promise(resolve=>state.release=resolve);
   if(state.mode==='fail')return send({ok:false,error:state.errorCode??'device_offline'});
   if(state.mode==='lost')return route.abort('failed');
   if(state.mode==='missing')return send({ok:true});
   return send({ok:true,command_id:state.existingId??command_id,already:!!state.existingId});
  }
  if(name==='ps_panel_recovery_label'){state.labelReads++;return send({ok:true,label_version:1,ready:!!state.sheet.wifi?.wifi_applied_at,missing:state.sheet.wifi?.wifi_applied_at?[]:['wifi_not_confirmed'],wifi_rotation_pending:state.sheet.rotations.some(o=>o.kind==='wifi'&&o.status==='pending'),label:{device_id:device.id,serial:device.serial,ssid:state.sheet.wifi?.ssid,psk:state.sheet.wifi?.psk,wifi_applied_at:state.sheet.wifi?.wifi_applied_at}});}
  if(name==='ps_admin_legacy_credentials_context')return state.noLegacy?send({code:'42501'},403):send({ok:true,venue_id:venueId,device_id:device.id,serial:device.serial,legacy:true,print_server_id:ps.id,print_server_status:'active',ca_der_sha256:'a'.repeat(64),wifi_confirmed:!!state.sheet.wifi?.wifi_applied_at,admin_code_confirmed:!!state.sheet.wifi?.admin_code_applied_at});
  if(name==='ps_admin_legacy_credentials_reconcile'){state.reconciled.push(args.p_values);return send({ok:true,applied_at:'2026-01-01T00:00:00Z'});}
  if(name==='ps_panel_device'){state.reads++;if(state.holdRead)await new Promise(resolve=>state.releaseRead=resolve);if(state.readError)return send({code:state.readError==='denied'?'42501':'XX000',message:'Synthetic read error'},state.readError==='denied'?403:500);return send(state.sheet);}
  if(name==='ps_panel_ota')return send({ok:true,print_servers:[]});
  if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
  if(name==='portal_owner_venues')return send(owner?[venue]:[]);
  return send(null);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(owner?`${origin}/?section=print-servers&venue=${venueId}&lang=${lang}`:`${origin}/admin/print-servers/${venueId}?lang=${lang}`);await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);
 return {ctx,page,state};
}
const requested='2026-01-02T10:00:00Z', received='2026-01-02T10:01:00Z', completed='2026-01-02T10:02:00Z';
const operation=(status='pending',extra={})=>({command_id:'synthetic-wifi',kind:'wifi',status,requested_at:requested,completed_at:status==='pending'?null:completed,error_code:null,...extra});
async function settle(page){await page.waitForTimeout(180);}
async function tick(page){await page.clock.fastForward(10050);await settle(page);}
async function decode(bytes){const png=PNG.sync.read(bytes);assert.equal(png.width,590);assert.equal(png.height,354);return jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data;}
async function positions(page){return Promise.all(['dev-ssid','dev-psk','dev-admin-code','dev-applied-at'].map(id=>page.getByTestId(id).evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height};})));}
try {
 for(const owner of [false,true])for(const width of [390,1440]){
  const {ctx,page,state}=await setup(width,width===390?'es':'en',owner);
  const ssid=page.getByTestId('dev-ssid'),psk=page.getByTestId('dev-psk'),admin=page.getByTestId('dev-admin-code');
  await expect(ssid).toContainText(wifi.ssid);await expect(ssid.getByRole('button')).toHaveCount(1);
  await expect(psk).not.toContainText(wifi.psk);await expect(admin).not.toContainText(wifi.admin_code);
  const before=await positions(page);
  assert.ok(before[0].y<before[1].y);
  if(width===390)assert.ok(before[1].y<before[2].y&&before[2].y<before[3].y);
  else {assert.ok(before[0].x<before[2].x);assert.ok(Math.abs(before[0].y-before[2].y)<2);}
  await psk.getByRole('button').first().click();await expect(psk).toContainText(wifi.psk);
  await admin.getByRole('button').first().click();await expect(admin).toContainText('ABCD2-34567');
  assert.deepEqual(await positions(page),before);await expect(page.getByTestId('dev-qr')).toHaveCount(0);
  await admin.getByRole('button').last().click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'ABCD2-34567');
  await psk.getByRole('button').last().click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),wifi.psk);
  await admin.getByRole('button').first().click();await psk.getByRole('button').first().click();
  await expect(admin).not.toContainText('ABCD2-34567');await expect(psk).not.toContainText(wifi.psk);
  const confirmation=await page.getByTestId('dev-applied-at').innerText();assert.ok(confirmation.includes('2026'));assert.ok(!confirmation.includes('local_login'));
  await page.getByTestId('ps-device-panel').screenshot({path:`${out}/${owner?'owner':'admin'}-${width}-hidden.png`});
  await page.evaluate(()=>{window.labelText=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.labelText.push(text);return original.call(this,text,...args);};});
  const oldReads=state.labelReads;await page.getByTestId('dev-label-preview-action').click();
  const img=page.getByTestId('dev-label-preview-image');await expect(img).toBeVisible();assert.ok(state.labelReads>oldReads);
  const bytes=Buffer.from(await img.evaluate(async el=>Array.from(new Uint8Array(await(await fetch(el.src)).arrayBuffer()))));
  const qr=await decode(bytes);assert.ok(qr?.startsWith('WIFI:T:WPA;'));assert.ok(qr.includes(wifi.psk));assert.ok(!qr.includes(wifi.admin_code));
  const readBeforeExport=state.labelReads;const download=page.waitForEvent('download');await page.getByTestId('dev-label-download').click();
  const result=await download;await result.saveAs(`${out}/${owner?'owner':'admin'}-${width}-50x30.png`);assert.ok(state.labelReads>readBeforeExport);
  const {readFile}=await import('node:fs/promises');assert.equal(await decode(await readFile(`${out}/${owner?'owner':'admin'}-${width}-50x30.png`)),qr);
  const labelText=await page.evaluate(()=>window.labelText.join(' '));assert.ok(!labelText.includes(wifi.admin_code)&&!labelText.includes('ABCD2-34567'));assert.ok(labelText.includes(wifi.psk));
  await page.getByTestId('ps-device-panel').screenshot({path:`${out}/${owner?'owner':'admin'}-${width}-preview.png`});
  checks.push(`${owner?'owner':'admin'} ${width}: layout/order, hidden/reveal/copy stable, no side QR, preview + fresh PNG 590x354 QR Wi-Fi PASS`);
  await ctx.close();
 }
 // Exact legacy display/copy and form payload, current representations and full legacy limit.
 for(const value of ['LeGa-cY-9!','AB-CDE23456','abcde-23456','ABCD-E234-56','Z'.repeat(64)]) {
  const {ctx,page,state}=await setup(390,'en');state.sheet.wifi.admin_code=value;await page.reload();
  const admin=page.getByTestId('dev-admin-code');await expect(admin).not.toContainText(value);
  await admin.getByRole('button').first().click();
  const current=['abcde-23456','ABCD-E234-56'].includes(value),display=current?'ABCDE-23456':value;
  await expect(admin.locator('.dev-credential-value')).toHaveText(display);
  await admin.getByRole('button').last().click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),display);
  state.sheet.wifi.admin_code_applied_at=null;await page.reload();
  const form=page.getByTestId('legacy-admin_code-form');await expect(form).toBeVisible();
  await form.getByTestId('legacy-admin_code-code').fill(value);
  await expect(form.getByTestId('legacy-admin_code-code')).toHaveValue(value);
  await form.getByTestId('legacy-admin_code-fingerprint').fill('a'.repeat(12));await form.getByTestId('legacy-admin_code-check').check();
  await form.getByTestId('legacy-admin_code-submit').click();await expect.poll(()=>state.reconciled.length).toBe(1);
  assert.deepEqual(state.reconciled[0],{admin_code:current?'ABCDE23456':value});
  await ctx.close();
 }
 checks.push('Current 5-5/4-4-2 and exact mixed-case legacy/arbitrary hyphens/64 characters: display + clipboard + form RPC payload PASS');
 // Timers: pending/offline -> received -> applied/failed; dates/history survive reload.
 for(const terminal of ['applied','failed']) {
  const {ctx,page,state}=await setup(1440,'en');state.sheet.rotations=[operation('pending',{wait_reason:'device_offline'})];state.sheet.ps_online=false;
  await page.reload();await page.clock.install();const progress=page.getByTestId('dev-rotation-status-wifi');
  await expect(progress).toHaveAttribute('data-phase','offline');await expect(progress.getByRole('button',{name:'Check status',exact:false})).toBeVisible();
  let reads=state.reads,labelReads=state.labelReads;await tick(page);assert.ok(state.reads>reads&&state.labelReads>labelReads);
  state.sheet.rotations=[operation('pending',{received_at:received,wait_reason:'applying'})];state.sheet.ps_online=true;await tick(page);
  await expect(progress).toHaveAttribute('data-phase','received');await expect(progress.getByRole('button')).toHaveCount(1);
  state.sheet.rotations=[operation(terminal,{received_at:received})];await tick(page);await expect(progress).toHaveAttribute('data-phase',terminal);await expect(progress.getByRole('button')).toHaveCount(0);
  const dates=await progress.locator('dl').innerText();if(terminal==='applied')await expect(progress).toHaveClass(/credential-progress-applied/);
  await settle(page);reads=state.reads;labelReads=state.labelReads;await page.clock.fastForward(120000);await settle(page);
  assert.equal(state.reads,reads);assert.equal(state.labelReads,labelReads);
  queryCounts.push({state:terminal,simulatedMilliseconds:120000,sheetBefore:reads,sheetAfter:state.reads,labelBefore:labelReads,labelAfter:state.labelReads,additionalSheetQueries:state.reads-reads,additionalLabelQueries:state.labelReads-labelReads});
  await page.reload();await expect(progress).toHaveAttribute('data-phase',terminal);assert.equal(await progress.locator('dl').innerText(),dates);
  assert.equal(state.sheet.rotations.length,1);await expect(progress.getByRole('button')).toHaveCount(0);
  await progress.screenshot({path:`${out}/${terminal}.png`});
  checks.push(`${terminal}: pending/offline and received queried both; terminal stopped both queries for 120s simulated, result/dates retained after reload PASS`);
  await ctx.close();
 }
 for(const kind of ['certificate','enrollment','network-error','uncertain']) {
  const {ctx,page,state}=await setup(1440,'en');
  if(kind==='certificate')state.sheet.cert_operations=[operation('pending',{kind:'cert_renew'})];
  if(kind==='enrollment'){state.sheet.device.legacy=false;state.sheet.enroll_credentials={state:'pending',wifi:'pending',admin_code:'pending'};}
  if(kind==='network-error')state.readError=true;
  await page.reload();await page.clock.install();
  if(kind==='uncertain'){
   state.mode='lost';await page.getByTestId('dev-rotate-code').click();await page.getByTestId('dev-confirm-accept').click();
   const status=page.getByTestId('dev-rotation-dialog-status-admin_code');await expect(status).toHaveAttribute('data-phase','uncertain');await expect(status.getByRole('button')).toHaveCount(0);
  }
  await settle(page);const before=state.reads;await tick(page);
  assert.equal(state.reads>before,kind!=='network-error');
  checks.push(`${kind}: ${kind==='network-error'?'no periodic query from error alone':'pending recovery query continues'} PASS`);await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({synthetic:true,externalRequestsIntercepted:true,checks,queryCounts},null,2));
 console.log(JSON.stringify({ok:true,checks},null,2));
} finally {await browser.close();}
