// PE-411: synthetic local fixtures, all external requests intercepted. No live authorization claim.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PS_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.PS_TEST_EVIDENCE??'docs/evidence/ps-rotation-progress';await mkdir(out,{recursive:true});
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
 const state={sheet:{ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:{...device,legacy:true},ps_online:true,wifi:{...wifi},rotations:[],cert:{},cert_operations:[],can_manage:true,is_platform_admin:true},reads:0,created:false,assigned:false,commands:[],mode:"ok",release:null};
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
  if(name==='ps_panel_recovery_label')return send({ok:true,label_version:1,ready:!!state.sheet.wifi?.wifi_applied_at,missing:state.sheet.wifi?.wifi_applied_at?[]:['wifi_not_confirmed'],wifi_rotation_pending:state.sheet.rotations.some(o=>o.kind==='wifi'&&o.status==='pending'),label:{device_id:device.id,serial:device.serial,ssid:state.sheet.wifi?.ssid,psk:state.sheet.wifi?.psk,wifi_applied_at:state.sheet.wifi?.wifi_applied_at}});
  if(name==='ps_admin_legacy_credentials_context')return state.noLegacy?send({code:'42501'},403):send({ok:true,venue_id:venueId,device_id:device.id,serial:device.serial,legacy:true,print_server_id:ps.id,print_server_status:'active',ca_der_sha256:'a'.repeat(64),wifi_confirmed:!!state.sheet.wifi?.wifi_applied_at,admin_code_confirmed:!!state.sheet.wifi?.admin_code_applied_at});
  if(name==='ps_panel_device'){state.reads++;if(state.holdRead)await new Promise(resolve=>state.releaseRead=resolve);if(state.readError)return send({code:state.readError==='denied'?'42501':'XX000',message:'Synthetic read error'},state.readError==='denied'?403:500);return send(state.sheet);}
  if(name==='ps_panel_ota')return send({ok:true,print_servers:[]});
  if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
  if(name==='portal_owner_venues')return send(owner?[venue]:[]);
  return send(null);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(owner?`${origin}/?section=print-servers&venue=${venueId}&lang=${lang}`:`${origin}/admin/print-servers/${venueId}?lang=${lang}`);await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);
 return {ctx,page,state};
}async function poll(page,state){const before=state.reads;await page.clock.fastForward(10050);await expect.poll(()=>state.reads).toBeGreaterThan(before);await page.waitForTimeout(50);}
async function dialogBounds(page){
 const d=page.getByTestId('dev-confirm');await expect(d).toBeVisible();
 const b=await d.boundingBox(),v=page.viewportSize();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=v.width&&b.y+b.height<=v.height);
 assert.ok(await d.evaluate(el=>el.contains(document.activeElement)));
 for(const button of await d.getByRole('button').all()){const r=await button.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=v.height);}
 await page.keyboard.press('Tab');assert.ok(await d.evaluate(el=>el.contains(document.activeElement)));
 await page.keyboard.press('Shift+Tab');assert.ok(await d.evaluate(el=>el.contains(document.activeElement)));
 if(v.width===390){await page.setViewportSize({width:390,height:220});
  const body=d.locator('.ps-dialog-body');assert.ok(await body.evaluate(el=>getComputedStyle(el).overflowY==='auto'&&el.scrollHeight>el.clientHeight));
  for(const button of await d.locator('.ps-dialog-actions').getByRole('button').all()){const r=await button.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=220);}
  await page.setViewportSize(v);
 }
}
const requested='2026-01-02T10:00:00Z',received='2026-01-02T10:01:00Z',waitAt='2026-01-02T10:02:00Z',done='2026-01-02T10:03:00Z';
const rotation=(command,extra={})=>({...command,status:'pending',requested_at:requested,received_at:null,completed_at:null,wait_updated_at:null,wait_reason:null,...extra});
async function labelQr(page){
 await expect(page.getByTestId('dev-label-preview-action')).toBeEnabled();await page.getByTestId('dev-label-preview-action').click();
 const img=page.getByTestId('dev-label-preview-image');await expect(img).toBeVisible();
 const bytes=await img.evaluate(async el=>Array.from(new Uint8Array(await(await fetch(el.src)).arrayBuffer())));
 const png=PNG.sync.read(Buffer.from(bytes));return jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data;
}
async function reveal(page,kind){const el=page.getByTestId(kind==='wifi'?'dev-psk':'dev-admin-code');await el.getByRole('button').first().click();return el;}
async function submit(page,kind){await page.getByTestId('dev-rotate-'+(kind==='wifi'?'wifi':'code')).click();await page.getByTestId('dev-confirm-accept').click();}
try{
 for(const [width,lang] of [[390,'es'],[1440,'en']])for(const kind of ['wifi','admin_code']){
  const {ctx,page,state}=await setup(width,lang);await page.clock.install();
  const status=page.getByTestId('dev-rotation-status-'+kind),modal=page.getByTestId('dev-rotation-dialog-status-'+kind),button=page.getByTestId('dev-rotate-'+(kind==='wifi'?'wifi':'code'));
  const oldQr=await labelQr(page);assert.ok(oldQr?.includes('0123456789'));
  const before=state.commands.length;await button.click();await dialogBounds(page);await page.keyboard.press('Escape');assert.equal(state.commands.length,before);
  state.mode='hold';await submit(page,kind);await expect(modal).toHaveAttribute('data-phase','sending');await dialogBounds(page);
  assert.equal(await modal.locator('[role="progressbar"][aria-valuenow]').count(),0);await expect(modal.locator('.credential-progress-spinner')).toBeVisible();
  await expect.poll(()=>!!state.release).toBe(true);state.release();state.release=null;state.mode='ok';
  await expect(modal).toHaveAttribute('data-phase','accepted');await page.getByTestId('dev-dialog-close').click();
  await expect(button).toBeDisabled();const command=state.commands.at(-1);
  state.sheet.rotations=[rotation({...command,command_id:'unrelated'}, {status:'applied'}),rotation({...command,kind:kind==='wifi'?'admin_code':'wifi'},{status:'applied'})];
  await poll(page,state);await expect(status).toHaveAttribute('data-phase','accepted');
  state.sheet.rotations=[rotation(command,{wait_reason:'device_offline'})];state.sheet.ps_online=false;
  await poll(page,state);await expect(status).toHaveAttribute('data-phase','offline');await expect(status).toHaveAttribute('data-command-id',command.command_id);
  const dates=await status.locator('dl').innerText();await page.reload();await expect(status).toHaveAttribute('data-phase','offline');await expect(status.locator('dl')).toHaveText(await status.locator('dl').textContent());
  assert.equal(await status.locator('dl').innerText(),dates);await expect(button).toBeDisabled();await expect(page.getByTestId('dev-confirm')).toHaveCount(0);
  const secret=await reveal(page,kind);await expect(secret).toContainText(kind==='wifi'?'0123456789':'ABCD234567');
  if(kind==='wifi'){await expect(page.getByTestId('dev-label-preview-action')).toBeDisabled();await expect(page.getByTestId('dev-label-preview-image')).toHaveCount(0);}
  state.readError=true;await poll(page,state);await expect(status).toHaveAttribute('data-phase','uncertain');await expect(button).toBeDisabled();
  state.readError=false;await poll(page,state);await expect(status).toHaveAttribute('data-phase','offline');assert.equal(await status.locator('dl').innerText(),dates);
  state.sheet.ps_online=true;state.sheet.rotations=[rotation(command,{received_at:received,wait_reason:'ota_active',wait_updated_at:waitAt})];
  await poll(page,state);await expect(status).toHaveAttribute('data-phase','received');await expect(status).toContainText(lang==='es'?'Actualización':'update');
  const otaDates=await status.locator('dl').innerText();await poll(page,state);assert.equal(await status.locator('dl').innerText(),otaDates);
  state.sheet.rotations=[rotation(command,{received_at:received,wait_reason:'reboot_pending',wait_updated_at:waitAt})];await poll(page,state);await expect(status).toContainText(lang==='es'?'Reinicio pendiente':'pending restart');
  state.sheet.rotations=[rotation(command,{received_at:received,wait_reason:'applying'})];await poll(page,state);await expect(status).toHaveAttribute('data-phase','received');assert.ok(!/aplicándose|being applied now|Aplicando/.test(await page.getByTestId('ps-device-panel').innerText()));
  // There is no post-startup countdown in the versioned contract; no telemetry means not reported.
  state.sheet.rotations=[rotation(command)];delete state.sheet.ps_online;await poll(page,state);await expect(status).toHaveAttribute('data-phase','pending');await expect(status).toContainText(lang==='es'?'No se informó':'No reason for the wait');
  await page.screenshot({path:`${out}/${kind}-${lang}-pending.png`});
  state.sheet.rotations=[rotation(command,{status:'failed',error_code:'wifi_apply_failed',error_detail:'SECRET_SHOULD_NEVER_RENDER',previous_kept:true,completed_at:done})];
  await poll(page,state);await expect(status).toHaveAttribute('data-phase','failed');await expect(button).toBeEnabled();assert.ok(!(await page.locator('body').innerText()).includes('SECRET_SHOULD_NEVER_RENDER'));
  assert.equal(await labelQr(page),oldQr);await expect(secret).toContainText(kind==='wifi'?'0123456789':'ABCD234567');
  await submit(page,kind);await expect(modal).toHaveAttribute('data-phase','accepted');const next=state.commands.at(-1);await page.getByTestId('dev-dialog-close').click();
  state.sheet.rotations=[rotation(next)];await poll(page,state);
  state.sheet.rotations=[rotation(next,{status:'applied',completed_at:done,received_at:received})];
  state.sheet.wifi={...wifi,...(kind==='wifi'?{psk:'9876543210',wifi_applied_at:done}:{admin_code:'ZYXW987654',admin_code_applied_at:done})};
  await poll(page,state);await expect(status).toHaveAttribute('data-phase','applied');await expect(page.getByTestId('dev-confirm')).toHaveCount(0);
  await expect(await reveal(page,kind)).toContainText(kind==='wifi'?'9876543210':'ZYXW987654');const newQr=await labelQr(page);assert.equal(newQr!==oldQr,kind==='wifi');
  const stored=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));assert.ok(!stored.includes('9876543210')&&!stored.includes(next.command_id));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${out}/${kind}-${lang}-applied.png`});
  checks.push({criterion:1,fixture:`${kind}-${lang}-${width}`,result:'sending → accepted only ok+id → offline → received OTA/restart → inferred applying stays received → missing reason reported; no fabricated progress or countdown'});
  checks.push({criterion:2,fixture:`${kind}-${lang}-${width}`,result:'close → refresh same id/date → polling interruption locks duplicates → restored → device failure retains old secret/label → exact done changes corresponding secret/label; no reopened modal or storage'});
  await ctx.close();
 }
 // Errors and lost responses are separate from accepted/device progress, in both locales.
 for(const lang of ['es','en']){
  for(const code of ['no_device_credentials','wifi_not_confirmed','admin_code_not_confirmed','device_offline','UNSAFE_SECRET']){
   const {ctx,page,state}=await setup(1440,lang);await page.clock.install();
   const kind=code==='admin_code_not_confirmed'?'admin_code':'wifi',modal=page.getByTestId('dev-rotation-dialog-status-'+kind);
   state.mode='fail';state.errorCode=code;await submit(page,kind);await expect(modal).toHaveAttribute('data-phase','rejected');
   if(code==='no_device_credentials')await expect(modal).toContainText(lang==='es'?'Este equipo aún no tiene sus credenciales verificadas en la plataforma':'This device does not yet have verified credentials on the platform');
   assert.ok(!(await page.locator('body').innerText()).includes('UNSAFE_SECRET'));
   await page.getByTestId('dev-dialog-close').click();
   if(['no_device_credentials','wifi_not_confirmed','admin_code_not_confirmed'].includes(code)){
    if(code==='wifi_not_confirmed')state.sheet.wifi.wifi_applied_at=null;
    if(code==='admin_code_not_confirmed')state.sheet.wifi.admin_code_applied_at=null;
    await page.getByTestId('dev-rotation-status-'+kind).getByRole('button').click();
    await expect(page.getByTestId('dev-rotate-'+(kind==='wifi'?'wifi':'code'))).toBeDisabled();
    await expect(page.getByTestId('ps-device-panel').locator('a[href="#legacy-reconcile-title"]').first()).toBeVisible();
   }
   checks.push({criterion:3,fixture:`reject-${code}-${lang}`,result:'request rejected, localized safe explanation, no success/progress; absence locked, authorized existing reconciliation only'});await ctx.close();
  }
  const {ctx,page,state}=await setup(1440,lang);await page.clock.install();state.mode='missing';await submit(page,'wifi');
  await expect(page.getByTestId('dev-rotation-dialog-status-wifi')).toHaveAttribute('data-phase','uncertain');await page.getByTestId('dev-dialog-close').click();await expect(page.getByTestId('dev-rotate-wifi')).toBeDisabled();
  const count=state.commands.length;await poll(page,state);assert.equal(state.commands.length,count);
  const command=state.commands.at(-1);state.sheet.rotations=[rotation(command)];await poll(page,state);await expect(page.getByTestId('dev-rotation-status-wifi')).toHaveAttribute('data-phase','pending');
  checks.push({criterion:3,fixture:`missing-command-id-${lang}`,result:'acceptance uncertain; only reads, no automatic writes; reconciled same-kind order'});await ctx.close();
 }
 for(const owner of [true,false]){
  const {ctx,page,state}=await setup(1440,'es',owner);await page.clock.install();
  state.sheet.wifi={ssid:null,psk:null,admin_code:null,wifi_applied_at:null,admin_code_applied_at:null};state.noLegacy=true;
  state.holdRead=true;await page.reload();await expect.poll(()=>!!state.releaseRead).toBe(true);await expect(page.getByTestId('dev-rotate-wifi')).toHaveCount(0);
  state.holdRead=false;state.releaseRead();await expect(page.getByTestId('dev-rotate-wifi')).toBeDisabled();await expect(page.getByTestId('dev-rotate-code')).toBeDisabled();
  await expect(page.getByTestId('dev-credentials-missing-wifi')).toContainText('Wi-Fi');
  assert.ok(!(await page.getByTestId('ps-device-panel').innerText()).includes('Este equipo aún no tiene sus credenciales verificadas en la plataforma'));
  await expect(page.getByTestId('ps-device-panel').locator('a[href="#legacy-reconcile-title"]')).toHaveCount(0);
  assert.equal(state.commands.length,0);checks.push({criterion:3,fixture:owner?'owner-unconfirmed-both':'admin-reconciliation-denied',result:'both credentials unconfirmed block both actions across refresh; not inferred no_device_credentials; initial read blocks; no unavailable/unauthorized reconciliation link'});await ctx.close();
 }
 for(const mode of ['lost','already']){
  const {ctx,page,state}=await setup(1440,'en');await page.clock.install();
  if(mode==='already')state.existingId='existing-order-fixture';else state.mode='lost';
  await submit(page,'wifi');const modal=page.getByTestId('dev-rotation-dialog-status-wifi');await expect(modal).toHaveAttribute('data-phase',mode==='lost'?'uncertain':'accepted');
  await page.getByTestId('dev-dialog-close').click();const count=state.commands.length;await poll(page,state);assert.equal(state.commands.length,count);
  state.sheet.rotations=[rotation({...state.commands.at(-1),command_id:state.existingId??state.commands.at(-1).command_id})];await poll(page,state);
  const status=page.getByTestId('dev-rotation-status-wifi');await expect(status).toHaveAttribute('data-phase','pending');await expect(status).toHaveAttribute('data-command-id',state.sheet.rotations[0].command_id);
  if(mode==='already')await expect(status).toContainText('already pending');
  checks.push({criterion:2,fixture:mode+'-response-wifi',result:'reconciled backend command by id, original requested date; no repeated write, no reopened modal'});await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/credential-checks.json`,JSON.stringify({origin,fixture:{venueId,device:'fixture-device',ps:'fixture-ps',serial:'PS-XXXXXXXX'},kind:'Synthetic browser responses; every external request intercepted, no real commands.',checks,errors},null,2));console.log(JSON.stringify({origin,checks,errors},null,2));
}finally{await browser.close();}
