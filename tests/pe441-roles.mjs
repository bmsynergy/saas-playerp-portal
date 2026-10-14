// PE-441 style verification. Every non-local request is intercepted; no device mutations.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {readFileSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
const ca=createHash('sha256').update(new X509Certificate(readFileSync(new URL('./fixtures/legacy-ca.pem',import.meta.url))).raw).digest('hex');
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PS_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.PS_TEST_EVIDENCE??'docs/evidence/pe441/roles';await mkdir(out,{recursive:true});
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
  if(name==='ps_admin_device_detail'){if(state.holdDetail)await new Promise(resolve=>state.releaseDetail=resolve);return state.firmwareError?send({code:'XX000'},500):send({ok:true,device:{...device,arch:'arm64',venue_id:venueId},update:{...state.contract,current_version:state.installed,latest_stable:state.latest?{edition_id:'stable',version:state.latest,model:device.model,arch:'arm64'}:null,update_available:state.updateAvailable,reason:state.latest?null:'no_stable_release',active_update:null,...state.contract},delete:{allowed:false,blockers:['assigned']}});}
  if(name==='ps-ota-admin'){state.commands.push(args);if(state.holdUpdate)await new Promise(resolve=>state.releaseUpdate=resolve);return send({ok:true,deployment_id:'fixture-deployment'});}
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
  if(name==='ps_panel_ota')return state.firmwareError?send({code:'XX000'},500):send({ok:true,print_servers:[{print_server_id:ps.id,hostname:ps.hostname,installed_version:state.installed,status:'none',model:device.model,arch:'arm64',update:{...state.contract,current_version:state.installed,latest_stable:state.latest?{edition_id:'stable',version:state.latest,model:device.model,arch:'arm64'}:null,update_available:!!state.latest,reason:state.latest?null:'no_stable_release',...state.contract}}]});
  if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
  if(name==='portal_owner_venues')return send(owner?[venue]:[]);
  return send(null);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(owner?`${origin}/?section=print-servers&venue=${venueId}&lang=${lang}`:`${origin}/admin/print-servers/${venueId}?lang=${lang}`);await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);
 return {ctx,page,state};
}

const candidate={edition_id:'canary-edition',version:'0.3.21',model:device.model,arch:'arm64',ring:'canary',general_eligible:false,eligibility_reason:'canary_not_confirmed',admitted:true,admitted_ring:'lab',canary_confirmed_at:null,lab_only:false,signed_at:'2026-10-13T22:53:38Z'};
const general={edition_id:'general-edition',version:'0.3.20',model:device.model,arch:'arm64'};
try{
 for(const owner of [true,false])for(const width of [390,1440]){
  const {ctx,page,state}=await setup(width,'es',owner);
  state.installed='0.3.19';state.latest=null;state.updateAvailable=false;
  state.contract=owner?{device_id:device.id,latest_stable:null,can_update:false,update_available:false,reason:'no_general_update',newer_signed_unpromoted:true}:{candidate,newest_signed:candidate,effective_ring:'lab',can_update:true,update_available:true,reason:null};
  await page.reload();
  const block=page.getByTestId(owner?'ps-ota-block':'admin-device-summary');
  const action=page.getByTestId(owner?'owner-device-update':'admin-device-update');
  if(owner){await expect(action).toBeDisabled();await expect(block).toContainText('No hay actualizaciones publicadas en General para este equipo');}
  else {await expect(action).toBeEnabled();await expect(block).toContainText('0.3.21');await expect(block).toContainText('Canary');await expect(block).toContainText('Laboratorio');}
  await block.screenshot({path:`${out}/${owner?'owner':'admin'}-${width}-unpromoted.png`});
  assert.equal(state.commands.length,0);
  // For OWNER the positive General edition is only a contract double; never cloud data.
  if(owner){state.latest=general.version;state.contract={device_id:device.id,latest_stable:general,can_update:true,update_available:true,reason:null};await page.reload();}
  await expect(action).toBeEnabled();await action.click();
  const confirmation=block.locator('.admin-device-confirm');await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('0.3.19');await expect(confirmation).toContainText(owner?'0.3.20':'0.3.21');
  assert.equal(state.commands.length,0,'Opening confirmation must not create an offer');
  await confirmation.screenshot({path:`${out}/${owner?'owner':'admin'}-${width}-confirmation.png`});
  state.holdUpdate=true;await confirmation.getByRole('button').first().click();
  await expect.poll(()=>state.commands.length).toBe(1);
  assert.deepEqual(state.commands[0],{action:owner?'update_owned_device':'update_device',...(owner?{venue_id:venueId}:{}),device_id:device.id,edition_id:owner?general.edition_id:candidate.edition_id,expected_installed_version:'0.3.19'});
  await expect(confirmation.getByRole('button').first()).toBeDisabled();
  await expect(block.locator('.firmware-update-action [role=status]')).toBeVisible();
  assert.equal(await action.evaluate(el=>getComputedStyle(el).cursor),'default');
  await expect.poll(()=>!!state.releaseUpdate).toBe(true);state.releaseUpdate();
  await expect(confirmation).toHaveCount(0);
  if(!owner){
   state.contract={candidate:null,newest_signed:{...candidate,admitted:false,admitted_ring:'general'},effective_ring:'general',can_update:false,update_available:false,reason:'no_general_update'};await page.reload();
   await expect(action).toBeDisabled();await expect(block.getByTestId('admin-device-newest-signed')).toContainText('0.3.21');
   await block.screenshot({path:`${out}/admin-${width}-not-admitted.png`});
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  checks.push({scope:owner?'owner':'admin',width,installed:'0.3.19',unpromoted:'0.3.21',confirmation:true,semanticDisabledDuringRequest:true,cursor:'default',separateLoadingStatus:true,externalWrites:0,interceptedPayload:state.commands[0]});
  await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({synthetic:true,externalRequestsIntercepted:true,checks,errors},null,2));console.log(JSON.stringify({ok:true,checks}));
}finally{await browser.close();}
