// PE-433.2: owner UI fixtures; every backend request intercepted, no real PS operation.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PS_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.PS_TEST_EVIDENCE??'test-results/pe433-owner-rotation';await mkdir(out,{recursive:true});
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
 const state={sheet:{ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:{...device,legacy:false},ps_online:true,wifi:{...wifi},rotations:[],cert:{},cert_operations:[],can_manage:true,is_platform_admin:!owner},reads:0,created:false,assigned:false,commands:[],mode:"ok",release:null};
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
  if(['ps_panel_state','ps_panel_device','ps_panel_recovery_label','ps_panel_rotate_wifi','ps_panel_rotate_admin_code'].includes(name)) assert.equal(args.p_venue_id,venueId,'All PS requests must stay within the selected owned venue');
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
try {
 for (const [width,lang] of [[390,'es'],[1440,'en']]) {
  const {ctx,page,state}=await setup(width,lang,true); await page.clock.install();
  assert.equal(state.sheet.is_platform_admin,false);
  const status=page.getByTestId('dev-rotation-status-wifi');
  await expect(page.getByTestId('dev-rotate-wifi')).toBeEnabled();
  await expect(page.getByTestId('dev-rotate-code')).toBeEnabled();
  await expect(page.getByTestId('https-renew')).toHaveCount(0);
  await expect(page.locator('a[href="#legacy-reconcile-title"]')).toHaveCount(0);
  const oldQr=await labelQr(page);
  await page.getByTestId('dev-rotate-wifi').click(); await dialogBounds(page);
  const warning=await page.getByTestId('dev-confirm').innerText();
  assert.match(warning,lang==='es'?/etiqueta.*física|física.*etiqueta/is:/physical.*label|label.*physical/is);
  assert.match(warning,lang==='es'?/dejará de coincidir|desactualizada/i:/no longer match|outdated/i);
  await page.screenshot({path:`${out}/wifi-confirm-${lang}.png`});
  await page.keyboard.press('Escape'); assert.equal(state.commands.length,0);
  state.mode='hold'; await submit(page,'wifi');
  await expect(page.getByTestId('dev-rotation-dialog-status-wifi')).toHaveAttribute('data-phase','sending');
  await expect.poll(()=>!!state.release).toBe(true); state.release();state.mode='ok';
  await expect(page.getByTestId('dev-rotation-dialog-status-wifi')).toHaveAttribute('data-phase','accepted');
  await page.getByTestId('dev-dialog-close').click();
  await expect(page.getByTestId('dev-label-print')).toBeDisabled();
  await expect(page.getByTestId('dev-label-print-replacement')).toHaveCount(0);
  const command=state.commands.at(-1); state.sheet.rotations=[rotation(command,{wait_reason:'device_offline'})];state.sheet.ps_online=false;
  await poll(page,state);await expect(status).toHaveAttribute('data-phase','offline');
  await page.reload();await expect(status).toHaveAttribute('data-phase','offline');
  await expect(page.getByTestId('dev-rotate-wifi')).toBeDisabled();
  await expect(page.getByTestId('dev-confirm')).toHaveCount(0);
  await expect(await reveal(page,'wifi')).toContainText(wifi.psk);
  state.sheet.rotations=[rotation(command,{received_at:received,wait_reason:'ota_active',wait_updated_at:waitAt})];
  await poll(page,state);await expect(status).toHaveAttribute('data-phase','received');
  await expect(page.getByTestId('dev-label-print')).toBeDisabled();
  await expect(page.getByTestId('dev-label-print-replacement')).toHaveCount(0);
  assert.equal(state.commands.length,1);
  state.sheet.rotations=[rotation(command,{status:'applied',completed_at:done,received_at:received})];
  state.sheet.wifi={...wifi,psk:'9876543210',wifi_applied_at:done};state.sheet.ps_online=true;
  await poll(page,state);await expect(status).toHaveAttribute('data-phase','applied');
  await expect(page.getByTestId('dev-label-print')).toBeEnabled();
  await expect(page.getByTestId('dev-label-replacement-ready')).toBeVisible();
  await page.reload();await expect(page.getByTestId('dev-label-print-replacement')).toBeVisible();
  const newQr=await labelQr(page);assert.notEqual(newQr,oldQr);assert.ok(newQr.includes('9876543210'));assert.ok(!newQr.includes(wifi.admin_code));
  await page.evaluate(()=>{window.prints=[];const append=Node.prototype.appendChild;Node.prototype.appendChild=function(node){const r=append.call(this,node);if(node instanceof HTMLIFrameElement)node.contentWindow.print=()=>window.prints.push(node.contentDocument.head.textContent);return r;};});
  await page.getByTestId('dev-label-print-replacement').click();await expect.poll(()=>page.evaluate(()=>window.prints.length)).toBe(1);
  assert.match(await page.evaluate(()=>window.prints[0]),/size:50mm 30mm;margin:0/);
  await page.evaluate(()=>document.querySelectorAll('iframe').forEach(f=>f.contentWindow.dispatchEvent(new Event('afterprint'))));
  await page.screenshot({path:`${out}/wifi-applied-${lang}.png`});
  await page.getByTestId('dev-rotate-code').click();await dialogBounds(page);
  const codeWarning=await page.getByTestId('dev-confirm').innerText();
  assert.match(codeWarning,lang==='es'?/administración local/i:/local administration/i);
  assert.match(codeWarning,lang==='es'?/no se imprime/i:/not printed/i);
  await page.screenshot({path:`${out}/admin-confirm-${lang}.png`});
  await page.getByTestId('dev-confirm-accept').click();await expect(page.getByTestId('dev-rotation-dialog-status-admin_code')).toHaveAttribute('data-phase','accepted');await page.getByTestId('dev-dialog-close').click();
  const adminCommand=state.commands.at(-1);state.sheet.rotations.unshift(rotation(adminCommand,{status:'failed',error_code:'admin_code_apply_failed',previous_kept:true,completed_at:done}));
  await poll(page,state);await expect(page.getByTestId('dev-rotation-status-admin_code')).toHaveAttribute('data-phase','failed');
  await expect(await reveal(page,'admin_code')).toContainText(wifi.admin_code);
  assert.equal(await labelQr(page),newQr);
  state.mode='fail';state.errorCode='device_not_assigned';await submit(page,'admin_code');
  await expect(page.getByTestId('dev-rotation-dialog-status-admin_code')).toHaveAttribute('data-phase','rejected');
  await expect(page.getByTestId('dev-confirm')).toContainText(lang==='es'?'asignado':'assigned');
  await page.getByTestId('dev-dialog-close').click();
  state.sheet.can_manage_credentials=false;await page.reload();await expect(page.getByTestId('dev-serial')).toBeVisible();await expect(page.getByTestId('dev-rotate-wifi')).toHaveCount(0);await expect(page.getByTestId('dev-rotate-code')).toHaveCount(0);
  await page.goto(`${origin}/?section=print-servers&venue=33333333-3333-4333-8333-333333333333&lang=${lang}`);
  await expect(page.getByTestId('dev-rotate-wifi')).toHaveCount(0);await expect(page.getByTestId('ps-device-panel')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:lang==='es'?'Acceso denegado':'Access denied'})).toBeVisible();
  checks.push({locale:lang,width,result:'Own venue only; both confirmations; sending/accepted/offline/received/applied; refresh retains progress; no duplicate; old Wi-Fi before ACK; updated QR and print after applied; admin failure retains code and label; assignment rejection; permission removal and foreign venue hide actions.'});
  await ctx.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/checks.json`,JSON.stringify({origin,kind:'Synthetic owner browser responses; all backend traffic intercepted, no real rotations or physical printing.',checks,errors},null,2));
 console.log(JSON.stringify({origin,checks,errors},null,2));
} finally {await browser.close();}
