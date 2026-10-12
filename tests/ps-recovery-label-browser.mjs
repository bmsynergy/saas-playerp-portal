// Recovery label UI: isolated API fixtures. Does not mutate DEV or simulate device confirmation in DEV.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {PNG} from 'pngjs';
import QRCode from 'qrcode';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799',out='test-results/pe418';await mkdir(out,{recursive:true});
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
async function setup(width,lang='en'){
 const ctx=await browser.newContext({viewport:{width,height:960},locale:lang==='es'?'es-ES':'en-US',permissions:['clipboard-read','clipboard-write']});
 await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
 const state={sheet:{ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:{...device},wifi:{...wifi},rotations:[],cert:{},cert_operations:[],can_manage:true,is_platform_admin:true},label:{ok:true,label_version:1,ready:true,missing:[],wifi_rotation_pending:false,label:{device_id:device.id,serial:device.serial,ssid:wifi.ssid,psk:wifi.psk,wifi_applied_at:wifi.wifi_applied_at}},labelError:false,labelFailures:0,sheetDelay:0,sheetDenied:false,labelDelay:0,reads:0,created:false,assigned:false};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const name=url.pathname.split('/').pop(),send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(url.pathname.endsWith('/user')?user:session);
  const args=route.request().postDataJSON()??{};
  if(name==='staff_profiles')return send(null);
  if(name==='is_platform_staff')return send(true);
  if(name==='portal_access')return send({is_platform_staff:true,platform_role:'super_admin',owner_venues:[]});
  if(name==='portal_tenant_directory')return send([venue]);
  if(name==='portal_ps_fleet')return send(fleet);
  if(name==='portal_ps_devices')return send({devices:[{...device,venue_id:venueId,venue_name:venue.name,print_server_id:ps.id,created_at:wifi.wifi_applied_at},...(state.created?[{...device,id:'fixture-new',serial:'PS-YYYYYYYY',status:'stock',venue_id:null,created_at:wifi.wifi_applied_at}]:[])]});
  if(name==='ps_admin_device_create'){state.created=true;return send({ok:true,device:{...device,id:'fixture-new',serial:'PS-YYYYYYYY',status:'stock'}});}
  if(name==='ps_admin_device_assign'){assert.equal(args.p_device_id,'fixture-new');assert.equal(args.p_venue_id,venueId);state.assigned=true;return send({ok:true,enrollment_code:'pse_SYNTHETIC_ONE_USE_ONLY',expires_at:'2026-12-01T00:00:00Z'});}
  if(name==='ps_panel_state')return send({venue_id:venueId,can_manage:true,print_server:ps,printers:[],pending_enrollment:null,last_scan:null});
  if(name==='ps_panel_device'){if(state.sheetDenied)return send({code:'42501',message:'forbidden'},403);if(state.sheetDelay)await new Promise(r=>setTimeout(r,state.sheetDelay));return send(state.sheet);}
  if(name==='ps_panel_recovery_label'){state.reads++;if(state.labelDelay){const delay=state.labelDelay;state.labelDelay=0;await new Promise(r=>setTimeout(r,delay));}if(state.labelFailures>0){state.labelFailures--;return send({message:'temporary failure'},500);}return state.labelError?send({message:'temporary failure'},500):send(state.label);}
  if(name==='ps_panel_ota')return send({ok:true,print_servers:[]});
  if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
  if(name==='portal_owner_venues')return send([]);
  return send(null);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/admin/print-servers/${venueId}?lang=${lang}`);await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);
 return {ctx,page,state};
}
try {
 for(const width of [390,1440]) {
  const {ctx,page,state}=await setup(width,'es');
  const actions=['dev-label-preview-action','dev-label-download','dev-label-print'];
  state.sheetDelay=1200;await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByTestId(actions[0])).toBeDisabled();
  await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);state.sheetDelay=0;
  await page.evaluate(()=>{window.labelTexts=[];const text=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(value,...args){window.labelTexts.push(value);return text.call(this,value,...args);};});
  for(const action of actions) await expect(page.getByTestId(action)).toBeEnabled();
  state.labelDelay=6000; // An unchanged polling result must not cancel an in-flight action.
  const before=state.reads;
  await page.getByTestId(actions[0]).click();await expect(page.getByTestId('dev-label-preview-image')).toBeVisible({timeout:9000});assert.ok(state.reads>before);
  const downloadEvent=page.waitForEvent('download');await page.getByTestId(actions[1]).click();const download=await downloadEvent;
  assert.equal(download.suggestedFilename(),'PS-XXXXXXXX-50x30mm.png');await download.saveAs(`${out}/synthetic-${width}.png`);
  const png=PNG.sync.read(await (await import('node:fs/promises')).readFile(`${out}/synthetic-${width}.png`));
  assert.equal(png.width,590);assert.equal(png.height,354);
  assert.equal(jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data,'WIFI:T:WPA;S:'+wifi.ssid.replace(/([\\;,:"])/g,'\\$1')+';P:'+wifi.psk+';;');
  await page.evaluate(()=>{window.prints=[];const append=Node.prototype.appendChild;Node.prototype.appendChild=function(node){const out=append.call(this,node);if(node instanceof HTMLIFrameElement)node.contentWindow.print=()=>window.prints.push(node.contentDocument.head.textContent);return out;};});
  await page.getByTestId(actions[2]).click();await expect.poll(()=>page.evaluate(()=>window.prints.length)).toBe(1);
  assert.match(await page.evaluate(()=>window.prints[0]),/size:50mm 30mm;margin:0/);
  const printedText=await page.evaluate(()=>window.labelTexts);assert.ok(printedText.includes(device.serial));assert.ok(!printedText.some(s=>s.includes(wifi.admin_code)));
  await page.evaluate(()=>document.querySelectorAll('iframe').forEach(f=>f.contentWindow.dispatchEvent(new Event('afterprint'))));
  await page.locator('#ps-recovery-help summary').click();
  const help=await page.locator('#ps-recovery-help').innerText();assert.doesNotMatch(help,/Tom|Beny|PE-411|legacy|endpoint|P13|\/api\//i);
  assert.match(help,/Online|En línea/i);assert.match(help,/administrativo/i);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByTestId('ps-device-panel').screenshot({path:`${out}/synthetic-ready-${width}.png`});
  // A new confirmation arriving between render and click must never export the old image.
  let downloads=0;page.on('download',()=>downloads++);
  state.label.label={...state.label.label,serial:'PS-ABCDEFGH',ssid:'Confirmed new network',psk:'9876543210',wifi_applied_at:'2026-01-02T00:00:00Z'};
  await page.getByTestId(actions[1]).click();await expect(page.getByTestId('dev-label-preview-image')).toHaveCount(0);assert.equal(downloads,0);
  await expect(page.getByTestId(actions[1])).toBeEnabled();
  const changedEvent=page.waitForEvent('download');await page.getByTestId(actions[1]).click();const changed=await changedEvent;assert.equal(changed.suggestedFilename(),'PS-ABCDEFGH-50x30mm.png');await changed.saveAs(`${out}/synthetic-changed-${width}.png`);
  const changedPng=PNG.sync.read(await (await import('node:fs/promises')).readFile(`${out}/synthetic-changed-${width}.png`));
  assert.equal(jsQR(new Uint8ClampedArray(changedPng.data),changedPng.width,changedPng.height)?.data,'WIFI:T:WPA;S:Confirmed new network;P:9876543210;;');
  // Server pending and API errors hide any old preview and disable all exports.
  await page.getByTestId(actions[0]).click();await expect(page.getByTestId('dev-label-preview-image')).toBeVisible();
  state.label.wifi_rotation_pending=true;
  for(const action of actions) await expect(page.getByTestId(action)).toBeDisabled({timeout:12000});
  await expect(page.getByTestId('dev-label-preview-image')).toHaveCount(0);
  state.label.wifi_rotation_pending=false;
  for(const action of actions)await expect(page.getByTestId(action)).toBeEnabled({timeout:12000});
  // A single failed fresh read recovers with the same fingerprint, without a reload.
  state.labelFailures=1;await page.getByTestId(actions[0]).click();
  await expect(page.getByTestId(actions[0])).toBeEnabled({timeout:12000});
  await page.getByTestId(actions[0]).click();await expect(page.getByTestId('dev-label-preview-image')).toBeVisible();
  state.sheetDenied=true;
  for(const action of actions)await expect(page.getByTestId(action)).toBeDisabled({timeout:15000});
  await expect(page.getByTestId('dev-label-preview-image')).toHaveCount(0);
  state.sheetDenied=false;
  for(const action of actions)await expect(page.getByTestId(action)).toBeEnabled({timeout:15000});
  state.labelError=true;
  await page.reload();for(const action of actions)await expect(page.getByTestId(action)).toBeDisabled();
  state.labelError=false;
  for(const [reason,words] of [['credentials_permission',/permiso/i],['device_not_assigned',/asign/i],['print_server_not_active',/activ/i],['wifi_not_confirmed',/confirm/i]]) {
   state.label={ok:true,label_version:1,ready:false,missing:[reason],wifi_rotation_pending:false,label:null};
   if(reason==='credentials_permission')state.sheet.can_read_credentials=false;
   if(reason==='device_not_assigned')state.sheet.device=null;
   await page.reload();for(const action of actions)await expect(page.getByTestId(action)).toBeDisabled();
   await expect(page.getByTestId('dev-label')).toContainText(words);
  }
  checks.push(`${width}px: real-label API contract drives preview/download/print; fresh rotation replaces serial, SSID and decoded QR; pending/error/missing/permission states blocked; neutral instructions`);
  await ctx.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/checks.json`,JSON.stringify({kind:'isolated browser fixtures, not live device rotation',checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
} finally { await browser.close(); }
