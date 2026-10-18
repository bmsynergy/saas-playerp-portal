import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {devices,inventory,venueDevice,detail,stockSheet,wifi,printer,venues,when,A,B,C,N,P,V,W,RA,RB} from './fixtures/pe469.mjs';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out=process.env.PS_TEST_EVIDENCE??'docs/evidence/rings/browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='f4690000-0000-4000-8000-000000000099',user={id:uid,email:'pe469@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const report={origin,simulated:'All backend and auth requests intercepted. No live writes, hardware or real device data.',checks:[],errors:[],unexpected:[],network:[],writes:[]};
const sheet=(id,ctx=true)=>`/admin/print-servers/devices/${id}${ctx?`?fromVenue=${V}`:''}`,list=`/admin/tenants/${V}/print-servers`;
async function setup(width,{owner=false,loggedOut=false,record=false,lang='en',role='super_admin'}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000},locale:lang,permissions:['clipboard-read','clipboard-write'],recordVideo:record?{dir:out,size:{width,height:1000}}:undefined});
 await ctx.addInitScript(({session,loggedOut,lang})=>{if(!loggedOut&&!sessionStorage.getItem('pe469-login-completed'))localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,loggedOut,lang});
 const s={channelFail:false,conflict:false,channelDelay:0,deviceRevision:3,rows:Array.from({length:90},(_,i)=>({print_server_id:i===0?RA:i===1?RB:`f4800000-0000-4000-8000-${String(i).padStart(12,'0')}`,device_id:i===0?A:i===1?B:null,serial:`PS-RINGS-${String(i).padStart(3,'0')}`,name:i===0?'Front desk Alpha':i===1?'Kitchen Beta':`Server ${i}`,hostname:`host-${i}`,venue_id:V,venue_name:'Shared fixture venue',channel:i<30?'lab':i<60?'canary':'general',channel_revision:3,channel_source:'admin',channel_updated_at:when,status:i===2?'pending':'active',online:i%2===0,last_seen_at:when,installed_version:i===0?'0.3.21':'0.3.23',model:'rpi4-2gb',arch:'arm64',update_in_progress:i===3,href:i<2?`/admin/print-servers/devices/${i===0?A:B}`:null})),devices:devices(),calls:[],failUnlink:null,deny:false,hold:null,prepareCount:0};
 const find=args=>s.devices.find(d=>d.device_id===(args.p_device_id??args.p_id)||d.runtime?.print_server_id===(args.p_print_server_id??args.p_id));
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  const args=req.postDataJSON()??{};s.calls.push({name,args});
  if(name==='is_platform_staff')return send(!owner);
  if(name==='portal_access')return send({is_platform_staff:!owner,platform_role:owner?null:role,owner_venues:owner?[venues[0]]:[]});
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

  if(name==='ps_ota_channels_page'){
   if(s.channelDelay)await new Promise(resolve=>setTimeout(resolve,s.channelDelay));
   if(s.channelFail)return send({code:'fixture_failure'},503);
   let rows=s.rows.filter(r=>(!args.p_query||`${r.serial} ${r.name}`.toLowerCase().includes(args.p_query.toLowerCase()))&&(!args.p_status||args.p_status==='all'||(args.p_status==='online'?r.online:args.p_status==='offline'?!r.online:r.status===args.p_status))&&(!args.p_venue_id||r.venue_id===args.p_venue_id));
   const counts=Object.fromEntries(['lab','canary','general'].map(r=>[r,rows.filter(x=>x.channel===r).length]));
   if(args.p_channel)rows=rows.filter(r=>r.channel===args.p_channel);
   const result={ok:true,total:rows.length,counts,limit:args.p_limit,offset:args.p_offset,rows:rows.slice(args.p_offset,args.p_offset+args.p_limit)};
   report.network.push({name,args,response:structuredClone(result)});return send(result);
  }
  if(name==='ps-ota-admin'){
   assert.equal(args.action,'set_channel');const row=s.rows.find(r=>r.print_server_id===args.print_server_id);assert(row);
   report.writes.push({name,args,simulated:true});assert.equal(args.expected_revision,row.channel_revision);assert.equal(args.expected_channel,row.channel);assert(!('group_id'in args));
   if(s.conflict){row.channel_revision++;return send({ok:false,error:'channel_changed',channel:row.channel,revision:row.channel_revision},409);}
   const from=row.channel;row.channel=args.channel;row.channel_revision++;return send({ok:true,changed:true,from,channel:row.channel,revision:row.channel_revision,print_server_id:row.print_server_id,device_id:row.device_id});
  }
  if(name==='ps_admin_device_prepare'){
   const d=find(args);assert.equal(d.device_id,N);s.prepareCount++;d.link.preparation.state='code_issued';d.link.preparation.code_expires_at=new Date(Date.now()+600000).toISOString();
   return send({ok:true,device_id:d.device_id,enrollment_code:`pse_SYNTHETIC_MEMORY_ONLY_${s.prepareCount}`,expires_at:d.link.preparation.code_expires_at,link:d.link});
  }
  if(name==='ps_device_set_label'){const d=find(args);d.label=d.display_name=d.link.label=d.link.display_name=args.p_label;return send({ok:true,device_id:d.device_id,changed:true,label:d.label,link:d.link});}
  if(name==='ps_admin_device_assign'){const d=find(args);d.venue={id:V,name:venues[0].name};d.lifecycle=d.link.lifecycle='assigned';d.link.venue_id=V;d.link.venue_name=venues[0].name;d.capabilities.assign.allowed=false;return send({ok:true,device_id:d.device_id,venue_id:V,link:d.link});}
  if(name==='ps_admin_cert_renew'){assert.equal(args.p_print_server_id,RA);return send({ok:false,error:'device_offline'});}
  if(name==='ps_admin_device_detail'||name==='ps_admin_device_manage'){const d=find(args),body=detail(d);body.update={...body.update,current_known:true,editions:[],editions_total:0,editions_limit:20,validation:{required:false},reason:'up_to_date',channel:{ring:'lab',revision:s.deviceRevision,source:'admin',updated_at:when,can_change:true,blocked_reason:null,deployment_groups:[],href:'/admin/print-servers/channels'}};return send(body);}
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
async function shot(page,file){await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);await page.screenshot({path:`${out}/${file}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow ${file}`);}
try {
 for(const width of [1440,390])for(const lang of ['en','es']){
  const {ctx,page,s}=await setup(width,{lang});
  await page.goto(`${origin}/admin/print-servers/channels?lang=${lang}`);
  const cards=page.getByTestId('channels-counts').getByRole('button');await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('channels-ring-lab')).toContainText('30');
  await expect(page.getByTestId('channels-list')).toHaveCount(0);
  assert.equal(s.calls.filter(c=>c.name==='ps_ota_channels_page')[0].args.p_limit,1);
  await shot(page,`choose-${lang}-${width}`);
  const lab=page.getByTestId('channels-ring-lab');await lab.focus();await page.keyboard.press('Enter');await expect(lab).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(25);
  await expect(page.getByTestId('channels-total')).toContainText('30');
  assert.equal(await page.getByTestId('channels-pagination-size').count(),0);
  const first=page.getByTestId(`channel-row-${RA}`);await expect(first.getByRole('combobox')).toHaveCount(0);
  await first.getByRole('button').focus();await page.keyboard.press('Space');await expect(first.getByRole('button')).toHaveAttribute('aria-expanded','true');await expect(first).toContainText('0.3.21');await expect(first).not.toContainText('0.3.23');
  await shot(page,`accordion-${lang}-${width}`);
  await page.getByTestId(`channel-row-${RB}`).getByRole('button').click();await expect(page.getByTestId(`channel-row-${RB}`)).toContainText('0.3.23');await expect(first.getByRole('button')).toHaveAttribute('aria-expanded','false');
  await page.getByTestId('channels-pagination-next').click();await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(5);assert.equal(new URL(page.url()).searchParams.get('page'),'2');
  await page.reload();await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(5);await expect(lab).toHaveAttribute('aria-pressed','true');
  await shot(page,`page2-${lang}-${width}`);
  await page.getByTestId('channels-search').fill('PS-RINGS-00');await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(10);assert.equal(new URL(page.url()).searchParams.get('page'),null);await expect(lab).toContainText('10');await expect(page.getByTestId('channels-ring-canary')).toContainText('0');
  await page.getByTestId('channels-status').selectOption('online');await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(5);await expect(lab).toContainText('5');await expect(page.getByTestId('channels-total')).toContainText('5');
  await page.reload();await expect(page.getByTestId('channels-search')).toHaveValue('PS-RINGS-00');await expect(page.getByTestId('channels-status')).toHaveValue('online');
  await first.getByRole('button').click();const before=page.url();await first.getByRole('link').click();await page.getByTestId('ps-sheet-back').waitFor();
  await expect(page.getByTestId('admin-device-change-channel')).toBeVisible();
  await page.getByTestId('admin-device-change-channel').click();const deviceDialog=page.getByTestId('admin-device-channel-dialog');await deviceDialog.locator('input[value="canary"]').check();s.deviceRevision=4;
  const writesBefore=report.writes.length;await deviceDialog.getByRole('button',{name:lang==='es'?'Confirmar':'Confirm',exact:true}).click();await expect(deviceDialog).toHaveCount(0);assert.equal(report.writes.length,writesBefore,'stale device revision causes no write');
  await page.reload();await page.getByTestId('ps-sheet-back').click();await expect(page).toHaveURL(before);await expect(lab).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('channels-search').fill('no-such-server');await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(0);await shot(page,`empty-${lang}-${width}`);
  await page.getByTestId('channels-search').fill('');await page.getByTestId('channels-status').selectOption('');await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(25);
  s.conflict=true;await first.getByRole('button').click();await first.getByRole('combobox').selectOption('canary');const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('PS-RINGS-000');await expect(dialog).toContainText(lang==='es'?'No se instala nada':'Nothing is installed');await dialog.getByRole('button',{name:lang==='es'?'Confirmar':'Confirm',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('alert')).toBeVisible();
  assert.equal(s.rows[0].channel,'lab');assert.equal(s.rows[0].channel_revision,4);
  s.conflict=false;await first.getByRole('combobox').selectOption('canary');await page.getByRole('alertdialog').getByRole('button',{name:lang==='es'?'Confirmar':'Confirm',exact:true}).click();await expect(first).toHaveCount(0);assert.equal(s.rows[0].channel,'canary');assert.equal(s.rows[1].channel,'lab');await expect(page.getByTestId('channels-ring-canary')).toContainText('31');
  s.channelFail=true;await page.getByRole('button',{name:lang==='es'?'Actualizar':'Refresh',exact:true}).first().click();await expect(page.locator('.form-error')).toBeVisible({timeout:25000});await shot(page,`error-${lang}-${width}`);
  report.checks.push({width,lang,countsAndBoundedPages:true,keyboard:true,accordionIsolation:true,returnAndRefresh:true,searchFilters:true,emptyError:true,fixtureConflictAndSuccess:true});await ctx.close();
 }
 for(const role of ['owner','support','operations']){
  const {ctx,page,s}=await setup(390,{owner:role==='owner',role});await page.goto(`${origin}/admin/print-servers/channels`);await page.waitForTimeout(800);await expect(page.getByTestId('channels-page')).toHaveCount(0);assert.equal(s.calls.filter(c=>c.name==='ps_ota_channels_page').length,0);await expect(page.getByTestId('ps-tab-channels')).toHaveCount(0);if(role==='owner'){await page.goto(`${origin}/?venue=${V}&section=print-servers&device=${A}`);await expect(page.getByTestId('ps-device-sheet')).toBeVisible();await expect(page.getByTestId('admin-device-channel')).toHaveCount(0);await expect(page.getByTestId('admin-device-change-channel')).toHaveCount(0);await expect(page.getByTestId('ps-tab-channels')).toHaveCount(0);await shot(page,'owner-no-rings-390');}
  report.checks.push({role,routeDenied:true,noAdminRead:true,frontendFixtureOnly:true});await ctx.close();
 }
 const pages=report.network.filter(x=>x.name==='ps_ota_channels_page');assert(pages.some(x=>x.args.p_offset===25));assert(pages.every(x=>x.args.p_limit===(x.args.p_channel?25:1)&&x.response.rows.length<=x.args.p_limit));assert(!report.writes.some(x=>x.args.action!=='set_channel'));
 assert.equal(report.errors.length,0);assert.equal(report.unexpected.length,0);report.pass=true;
} catch(error){report.pass=false;report.failure=error.stack;console.error(error);process.exitCode=1;}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,network:report.network.length,writes:report.writes.length,unexpected:report.unexpected}));}
