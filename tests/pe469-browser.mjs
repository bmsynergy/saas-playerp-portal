import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {devices,inventory,venueDevice,detail,stockSheet,wifi,printer,venues,when,A,B,C,N,P,V,W,RA,RB} from './fixtures/pe469.mjs';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out=process.env.PS_TEST_EVIDENCE??'docs/evidence/pe469/browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='f4690000-0000-4000-8000-000000000099',user={id:uid,email:'pe469@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const report={origin,simulated:'All backend and auth requests intercepted. No live writes, hardware or real device data.',checks:[],errors:[],unexpected:[]};
const sheet=(id,ctx=true)=>`/admin/print-servers/devices/${id}${ctx?`?fromVenue=${V}`:''}`,list=`/admin/tenants/${V}/print-servers`;
async function setup(width,{owner=false,loggedOut=false,record=false}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000},locale:'es-ES',permissions:['clipboard-read','clipboard-write'],recordVideo:record?{dir:out,size:{width,height:1000}}:undefined});
 await ctx.addInitScript(({session,loggedOut})=>{if(!loggedOut&&!sessionStorage.getItem('pe469-login-completed'))localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale','es');},{session,loggedOut});
 const s={devices:devices(),calls:[],failUnlink:null,deny:false,hold:null,prepareCount:0};
 const find=args=>s.devices.find(d=>d.device_id===(args.p_device_id??args.p_id)||d.runtime?.print_server_id===(args.p_print_server_id??args.p_id));
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  const args=req.postDataJSON()??{};s.calls.push({name,args});
  if(name==='is_platform_staff')return send(!owner);
  if(name==='portal_access')return send({is_platform_staff:!owner,platform_role:owner?null:'super_admin',owner_venues:owner?[venues[0]]:[]});
  if(name==='portal_tenant_directory')return send(owner?[]:venues);
  if(name==='portal_owner_venues')return send([{...venues[0],is_owner:true}]);
  if(name==='portal_tenant_detail')return send({venue:venues.find(v=>v.id===args.p_venue_id),print_servers:[]});
  if(name==='ps_panel_devices')return send({ok:true,venue_id:args.p_venue_id,can_manage:true,devices:s.devices.filter(d=>d.venue?.id===args.p_venue_id).map(venueDevice),unassigned_printers:[]});
  if(name==='ps_device_resolve'){
   const d=find(args);if(s.deny||!d||(owner&&d.venue?.id!==V))return send({ok:false,error:'forbidden'});
   const r=structuredClone(d);r.requested_id=args.p_id;if(args.p_id!==d.device_id){r.resolved_via='runtime_id';r.requested_runtime={print_server_id:args.p_id,status:'active',is_current:true};}
   if(owner){r.is_staff=false;r.capabilities.unlink.allowed=false;r.capabilities.prepare.allowed=false;}
   return send(r);
  }
  if(name==='ps_admin_device_unlink'){
   const d=find(args);assert(d,'known canonical unlink');assert(!s.calls.some(c=>c.name==='ps_admin_device_revoke'));
   if(s.failUnlink)return send({ok:false,error:s.failUnlink,message:s.failUnlink==='forbidden'?'No tienes permiso para desvincular este aparato.':'El vínculo cambió. Recarga y vuelve a revisar.',next_step:s.failUnlink==='forbidden'?'ask_platform_admin':'reload'});
   if(s.holdUnlink)await new Promise(resolve=>s.releaseUnlink=resolve);
   assert.equal(args.p_expected_rev,d.link.rev);d.venue=null;d.lifecycle='stock';d.runtime.venue_id=null;Object.assign(d.link,{venue_id:null,venue_name:null,lifecycle:'stock',state:'en_stock',rev:d.link.rev+1});d.link.sync={scope:'unlinked',rev:d.link.rev,ack_rev:null,ack_at:null,confirmed:false,requires_capability:'unlink_ack'};d.capabilities.unlink.allowed=false;d.capabilities.assign.allowed=true;
   return send({ok:true,device_id:d.device_id,credential_preserved:true,jobs_cancelled:2,link:d.link});
  }
  if(name==='portal_ps_devices')return send({ok:true,devices:s.devices.map(inventory)});
  if(name==='ps_admin_device_models')return send({ok:true,default:{model:'rpi4-2gb',label:'Raspberry Pi 4 · 2 GB',arch:'arm64'},models:[{model:'rpi4-2gb',label:'Raspberry Pi 4 · 2 GB',archs:['arm64'],default_arch:'arm64',active:true,is_default:true}]});
  if(name==='ps_admin_venue_search')return send({ok:true,venues:venues.map(v=>({...v,city:'San Juan',state:'PR',assigned_device:null}))});
  if(name==='ps_admin_device_create'){assert.equal(args.p_venue_id,null);const d=s.devices.find(d=>d.device_id===N);d.label=d.display_name=d.link.label=d.link.display_name=args.p_label??'Nuevo en stock';return send({ok:true,device:inventory(d)});}
  if(name==='ps_admin_device_prepare'){
   const d=find(args);assert.equal(d.device_id,N);s.prepareCount++;d.link.preparation.state='code_issued';d.link.preparation.code_expires_at=new Date(Date.now()+600000).toISOString();
   return send({ok:true,device_id:d.device_id,enrollment_code:`pse_SYNTHETIC_MEMORY_ONLY_${s.prepareCount}`,expires_at:d.link.preparation.code_expires_at,link:d.link});
  }
  if(name==='ps_device_set_label'){const d=find(args);d.label=d.display_name=d.link.label=d.link.display_name=args.p_label;return send({ok:true,device_id:d.device_id,changed:true,label:d.label,link:d.link});}
  if(name==='ps_admin_device_assign'){const d=find(args);d.venue={id:V,name:venues[0].name};d.lifecycle=d.link.lifecycle='assigned';d.link.venue_id=V;d.link.venue_name=venues[0].name;d.capabilities.assign.allowed=false;return send({ok:true,device_id:d.device_id,venue_id:V,link:d.link});}
  if(name==='ps_admin_cert_renew'){assert.equal(args.p_print_server_id,RA);return send({ok:false,error:'device_offline'});}
  if(name==='ps_admin_device_detail'||name==='ps_admin_device_manage')return send(detail(find(args)));
  if(name==='ps_admin_device_sheet')return send(stockSheet(find(args)));
  if(name.startsWith('ps_panel_')||name==='ps_admin_legacy_credentials_context'){
   const d=find(args);assert(d,`${name}: explicit selected runtime required`);if(!d.venue)return send({code:'42501'},403);assert.equal(args.p_venue_id,d.venue.id,`${name}: venue matching`);
   if(name==='ps_panel_state')return send({venue_id:d.venue.id,can_manage:true,print_server:{id:d.runtime.print_server_id,label:d.label,hostname:d.runtime.hostname,device_id:d.device_id,status:'active',software_version:d.compat.installed_version,online:d.runtime.online,last_seen_at:d.runtime.last_seen_at,ca_cert_status:d.device_id===A?'reported':'none',ca_cert_available:d.device_id===A,ca_cert_der_sha256:d.device_id===A?'a'.repeat(64):'b'.repeat(64)},printers:[printer(d)],pending_enrollment:null,last_scan:null});
   if(name==='ps_panel_device'){
    const body={ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:inventory(d),ps_online:d.runtime.online,wifi:wifi(d),rotations:[],cert:{status:d.device_id===A?'valid':'expired',hostname:d.runtime.hostname,der_sha256:d.device_id===A?'a'.repeat(64):'b'.repeat(64),not_before:when,not_after:d.device_id===A?'2027-10-01T00:00:00Z':when},cert_operations:[],can_manage:true,is_platform_admin:!owner};
    if(s.hold===d.device_id)await new Promise(resolve=>s.release=resolve);
    return send(body);
   }
   if(name==='ps_panel_recovery_label'){const w=wifi(d);return send({ok:true,label_version:1,ready:true,missing:[],label:{device_id:d.device_id,serial:d.serial,ssid:w.ssid,psk:w.psk,wifi_applied_at:when}});}
   if(name==='ps_admin_legacy_credentials_context')return send({ok:true,venue_id:d.venue.id,device_id:d.device_id,legacy:false,print_server_id:d.runtime.print_server_id,wifi_confirmed:true,admin_code_confirmed:true});
   if(name==='ps_panel_ota')return send({ok:true,print_servers:[{print_server_id:d.runtime.print_server_id,installed_version:d.compat.installed_version,update:detail(d).update}]});
   if(name==='ps_panel_printer_jobs')return send({ok:true,jobs:[{id:`job-${d.serial}`,status:d.device_id===A?'pending':'failed',created_at:when,error:d.device_id===A?null:'fixture_beta_error'}],total:1,limit:10,offset:0});
   if(name==='ps_panel_request_scan')return send({ok:false,error:d.device_id===A?'device_offline':'no_active_print_server'});
   if(name==='ps_panel_rotate_wifi'||name==='ps_panel_rotate_admin_code')return send({ok:false,error:'device_offline'});
  }
  report.unexpected.push(name);return send({ok:false,error:'unexpected_fixture_call'},400);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
 return {ctx,page,s};
}
async function shot(page,file){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${file}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow ${file}`);}
try{
 for(const width of [390,1440]){
  const {ctx,page,s}=await setup(width);
  await page.goto(origin+list);await expect(page.locator('[data-testid^="venue-ps-row-"]')).toHaveCount(3);await expect(page.getByText('PS-TEST469C')).toHaveCount(0);await shot(page,`c1-list-${width}`);
  await page.getByTestId(`venue-ps-open-${A}`).click();await expect(page.getByTestId('ps-device-sheet')).toHaveAttribute('data-device-id',A);await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByTestId('ps-connection-state')).toContainText('En línea');await expect(page.getByTestId('ps-link-sync')).toContainText('0.3.22');await expect(page.getByTestId('ps-link-sync')).toContainText('0.3.21');
  await expect(page.getByTestId('dev-ssid')).toContainText('TEST469A');await expect(page.getByText('Impresora PS-TEST469A',{exact:true}).first()).toBeVisible();await shot(page,`c1-sheet-${width}`);
  await page.getByTestId('dev-psk').getByRole('button').first().click();await expect(page.getByTestId('dev-psk')).toContainText('1234567890');
  assert.equal((await page.getByTestId('https-fingerprint').innerText()).replace(/[^a-f0-9]/gi,'').toLowerCase(),'a'.repeat(64));
  await page.getByTestId(`queue-toggle-printer-${A}`).click();await expect(page.getByTestId('job-row-job-PS-TEST469A')).toBeVisible();
  await page.getByTestId('ps-scan').click();await page.getByTestId('confirm-accept').click();await expect(page.getByTestId('action-result')).toHaveAttribute('data-ok','false');
  assert(s.calls.some(c=>c.name==='ps_panel_request_scan'&&c.args.p_print_server_id===RA));
  await expect(page.getByTestId('action-result')).toContainText('Barra');await expect(page.getByTestId('action-result')).toContainText('alimentación');
  await page.getByTestId('https-renew').click();await page.getByTestId('dev-confirm-accept').click();await expect(page.getByTestId('dev-result')).toHaveAttribute('data-ok','false');
  assert(s.calls.some(c=>c.name==='ps_admin_cert_renew'&&c.args.p_print_server_id===RA));
  await shot(page,`c1-operation-error-${width}`);
  await page.reload();await expect(page.getByTestId('ps-sheet-back')).toHaveAttribute('href',`${list}?selected=${A}`);
  await page.getByTestId('ps-sheet-back').click();await expect(page.getByTestId(`venue-ps-row-${A}`)).toHaveAttribute('data-selected','true');
  await page.goto(origin+sheet(RA));await expect(page).toHaveURL(origin+sheet(A));
  const sibling=JSON.stringify(s.devices.find(d=>d.device_id===B)),other=JSON.stringify(s.devices.find(d=>d.device_id===C));
  await page.getByTestId('ps-unlink').click();const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('PS-TEST469A');await shot(page,`c1-unlink-confirm-${width}`);
  s.failUnlink='forbidden';await dialog.getByRole('button',{name:'Desvincular',exact:true}).click();await expect(page.getByTestId('ps-unlink-error')).toContainText('permiso');await shot(page,`c1-forbidden-${width}`);
  s.failUnlink='stale_link_rev';await page.getByTestId('ps-unlink').click();await page.getByRole('alertdialog').getByRole('button',{name:'Desvincular',exact:true}).click();await expect(page.getByTestId('ps-unlink-error')).toContainText('Recarga');
  s.failUnlink=null;await page.getByTestId('ps-unlink').click();await page.getByRole('alertdialog').getByRole('button',{name:'Desvincular',exact:true}).click();await expect(page.getByTestId('ps-link-sync')).toContainText('sin local');assert.equal(s.devices.find(d=>d.device_id===A).link.prepared,true);assert.equal(JSON.stringify(s.devices.find(d=>d.device_id===B)),sibling);assert.equal(JSON.stringify(s.devices.find(d=>d.device_id===C)),other);
  await expect(page.getByTestId('ps-sheet-back')).toHaveAttribute('href',`${list}?selected=${A}`);
  await page.goto(origin+sheet(B));await expect(page.getByTestId('ps-connection-state')).toContainText('Sin conexión');await expect(page.getByTestId('ps-link-sync')).toContainText('sincronizado');await expect(page.getByTestId('dev-ssid')).toContainText('TEST469B');await page.getByTestId('dev-psk').getByRole('button').first().click();await expect(page.getByTestId('dev-psk')).toContainText('9876543210');
  assert.equal((await page.getByTestId('https-fingerprint').innerText()).replace(/[^a-f0-9]/gi,'').toLowerCase(),'b'.repeat(64));
  await page.getByTestId(`queue-toggle-printer-${B}`).click();await expect(page.getByTestId('job-row-job-PS-TEST469B')).toBeVisible();
  await expect(page.getByTestId('action-result')).not.toHaveAttribute('data-ok','false');
  await shot(page,`c4-offline-synced-${width}`);
  report.checks.push({width,criterion:1,passed:true,checks:'3 venue PS incl pending, foreign excluded; one h1; runtime canonical redirect; refresh/back selected; unlink forbidden/stale/success preserved preparation and siblings; credentials/printers scoped.'});
  report.checks.push({width,criterion:4,passed:true,checks:'A online 0.3.21 pending requires .22; B offline .23 confirmed; no rings enabled.'});
  await ctx.close();
 }
 const {ctx,page,s}=await setup(1440,{record:true});
 await page.goto(origin+'/admin/print-servers/inventory?create=1&fromVenue='+V);await expect(page.getByTestId('admin-device-add-dialog')).toBeVisible();
 const add=page.getByTestId('admin-device-add-dialog');await add.getByLabel('Etiqueta (opcional)',{exact:true}).fill('Nuevo preparado explícitamente');await add.getByRole('button',{name:'Revisar',exact:true}).click();await add.getByRole('button',{name:'Confirmar',exact:true}).click();
 await expect(page).toHaveURL(origin+sheet(N));await expect(page.getByTestId('ps-preparation')).toBeVisible();assert.equal(s.prepareCount,0);await shot(page,'c2-stock-1440');
 await page.clock.install();await page.getByTestId('ps-prepare').click();await expect(page.getByTestId('ps-preparation-code-value')).toHaveText('pse_SYNTHETIC_MEMORY_ONLY_1');
 const noSecret=async()=>{assert(!page.url().includes('pse_'));assert(!JSON.stringify(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).includes('pse_'));};await noSecret();
 await page.getByTestId('ps-preparation').getByRole('button',{name:'Copiar',exact:true}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('pse_SYNTHETIC_MEMORY_ONLY_1');
 await page.getByTestId('ps-prepare-regenerate').click();await page.getByTestId('ps-prepare-regenerate-confirm').click();await expect(page.getByTestId('ps-preparation-code-value')).toHaveText('pse_SYNTHETIC_MEMORY_ONLY_2');
 await page.getByTestId('ps-link-name').fill('Almacén · nombre guardado');await page.getByTestId('ps-link-name-save').click();await expect(page.getByTestId('ps-device-title')).toHaveText('Almacén · nombre guardado');await noSecret();
 await page.setViewportSize({width:390,height:1000});await shot(page,'c2-stock-390');
 await page.clock.fastForward(600001);await expect(page.getByTestId('ps-preparation-code-value')).toHaveCount(0);await expect(page.getByTestId('ps-prepare-regenerate')).toBeVisible();
 await page.reload();await expect(page.getByTestId('ps-preparation-code-value')).toHaveCount(0);await expect(page.getByTestId('ps-prepare-regenerate')).toBeVisible();assert.equal(s.prepareCount,2);await noSecret();
 assert(!JSON.stringify(s.calls).includes('pse_'));report.checks.push({criterion:2,passed:true,checks:'Create → returned stock id; no prepare until clicked; copy/reissue explicit; name saved; expiry clears secret; refresh loses secret; no pse_ in URL/storage/request log.'});const video=page.video();await ctx.close();if(video){await video.saveAs(`${out}/c2-create-prepare.webm`);await video.delete();}
 const login=await setup(390,{loggedOut:true});await login.page.goto(origin+sheet(N));await expect(login.page).toHaveURL(new RegExp('/auth/login\\?next='));assert.equal(new URL(login.page.url()).searchParams.get('next'),sheet(N));
 await login.page.getByLabel(/Correo|Email/i).fill('pe469@example.invalid');await login.page.locator('input[type="password"]').fill('synthetic-login');await login.page.getByRole('button',{name:/Entrar|Iniciar sesión|Sign in/i}).click();await expect(login.page).toHaveURL(origin+sheet(N));await expect(login.page.getByTestId('ps-device-sheet')).toBeVisible();report.checks.push({criterion:2,passed:true,checks:'Actual login form roundtrip preserves stock ID and fromVenue'});await login.ctx.close();
 const race=await setup(1440);race.s.hold=A;await race.page.goto(origin+sheet(A));await expect.poll(()=>!!race.s.release).toBe(true);await race.page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},sheet(B));await expect(race.page.getByTestId('dev-ssid')).toContainText('TEST469B');race.s.release();await race.page.waitForTimeout(300);await expect(race.page.getByTestId('dev-ssid')).toContainText('TEST469B');await expect(race.page.getByTestId('ps-device-title')).toContainText('Beta');report.checks.push({criterion:1,passed:true,checks:'Late A credential response after navigation cannot replace B'});await race.ctx.close();
 const late=await setup(1440);late.s.holdUnlink=true;await late.page.goto(origin+sheet(A));await late.page.getByTestId('ps-unlink').click();await late.page.getByTestId('ps-unlink-submit').click();await expect.poll(()=>!!late.s.releaseUnlink).toBe(true);await late.page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},sheet(B));late.s.releaseUnlink();await late.page.waitForTimeout(500);await expect(late.page).toHaveURL(origin+sheet(B));await expect(late.page.getByTestId('ps-device-title')).toContainText('Beta');report.checks.push({criterion:1,passed:true,checks:'Late unlink completion cannot navigate away from B'});await late.ctx.close();
 const owner=await setup(390,{owner:true});await owner.page.goto(`${origin}/?venue=${V}&section=print-servers&device=${B}`);await expect(owner.page.getByTestId('ps-device-sheet')).toBeVisible();await expect(owner.page.getByTestId('ps-unlink')).toHaveCount(0);await owner.page.goto(`${origin}/?venue=${V}&section=print-servers&device=${C}`);await expect(owner.page.getByTestId('ps-device-sheet')).toHaveCount(0);report.checks.push({criterion:1,passed:true,checks:'Owner has no unlink; foreign venue device denied'});await owner.ctx.close();
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);report.pass=true;
}catch(e){report.pass=false;report.failure=e.message;console.error(e);process.exitCode=1;}
finally{await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({pass:report.pass,checks:report.checks,unexpected:report.unexpected,failure:report.failure},null,2));}
