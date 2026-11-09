// EN/ES device presentation adapted from pe6034 fixtures. No requests reach a backend or a PS.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fixture, inventory, venueDevice, detail, wifi, venues, when, A, V, RA } from './fixtures/pe469.mjs';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out=process.env.PS_TEST_EVIDENCE??'test-results/i18n-device';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const user={id:'f6030000-0000-4000-8000-000000000099',email:'pe6034@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256'})}.${enc({sub:user.id,exp,aud:'authenticated',role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const report={origin,kind:'Synthetic intercepted fixtures; no LAN validation or real backend writes',views:[],states:[],errors:[],unexpected:[]};
async function setup(role,width,lang){
 const admin=role==='admin',ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
 await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
 const d=fixture(A,RA,V,'0.3.28',true,'PS · Prueba de ficha','PS-TEST6034');d.arch='arm64';d.is_staff=admin;d.can_manage=admin;
 d.link.state='sincronizado';d.link.sync.confirmed=true;d.link.sync.ack_rev=10;d.link.sync.ack_at=when;
 for(const c of Object.values(d.capabilities)){c.allowed=admin;if(!admin)c.reason='forbidden';}
 const host=d.runtime.hostname;
 const s={d,calls:[],url:`https://${host}.local:8443/`,host,port:8443,nextStep:'send_delivery_email',fail:false,serverId:RA};
 await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),name=u.pathname.split('/').pop();
  if(u.origin===origin&&['GET','HEAD'].includes(req.method()))return route.continue();
  if(u.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(u.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  const args=req.postDataJSON()??{};s.calls.push(name);
  if(name==='is_platform_staff')return send(admin);
  if(name==='portal_access')return send({is_platform_staff:admin,platform_role:admin?'super_admin':null,owner_venues:admin?[]:[{...venues[0],is_owner:true}]});
  if(name==='portal_tenant_directory')return send(venues);
  if(name==='portal_owner_venues')return send([{...venues[0],is_owner:true}]);
  if(name==='portal_tenant_detail')return send({venue:venues[0],print_servers:[]});
  if(name==='ps_device_resolve')return send(d);
  if(name==='ps_device_link_status')return send({ok:true,link:d.link});
  if(name==='ps_panel_devices')return send({ok:true,venue_id:V,can_manage:admin,devices:[venueDevice(d)],unassigned_printers:[]});
  if(name==='ps_admin_stock_status')return send({ok:true,device_id:A,serial:d.serial,model:d.model,arch:d.arch,lifecycle:d.lifecycle,legacy:false,venue_id:V,stock:{state:'validated_assigned',next_step:s.nextStep,label_ready:true,missing:[],checks:{enrolled:true,credentials_confirmed_by_device:true,status_reported_after_enroll:true,setup_url_reported:true,in_stock_without_venue:false},credential:{print_server_id:RA,enrolled_at:when,permanent:true},reported:{hostname:d.runtime.hostname,firmware_version:'0.3.28',setup_url:'http://10.77.0.1',last_status_at:when,last_seen_at:when},file:{file_id:'fixture-file',instance_id:'fixture',issued_at:when,expires_at:when,sha256:'a'.repeat(64),bytes:200,consumed_by_device:true}}});
  if(name==='ps_admin_stock_reserved_credentials')return send({ok:false,error:'forbidden'});
  if(name==='ps_admin_device_detail')return send(detail(d));
  if(name==='ps_admin_device_manage')return send({ok:true,device:inventory(d),channels:[],ring:null});
  if(name==='ps_panel_state')return s.fail?send({message:'fixture read failure'},500):send({venue_id:V,can_manage:admin,print_server:{id:s.serverId,label:d.label,hostname:s.host,device_id:'hardware-uuid-distinct-from-inventory',status:'active',software_version:'0.3.28',online:true,local_address:'10.0.0.128',local_port:s.port,last_seen_at:when,last_status_at:when,last_status:{portal_url:s.url,uptime_seconds:7200,queue_depth:0,note:'internal-note-must-not-render'},channel_opened_at:when},printers:[],pending_enrollment:null,last_scan:null});
  if(name==='ps_panel_device')return send({ok:true,credentials_version:1,can_read_credentials:false,can_manage_credentials:false,device:inventory(d),ps_online:true,wifi:null,rotations:[],cert:{},cert_operations:[],can_manage:admin,is_platform_admin:true,enroll_credentials:{state:'applied',wifi:'applied',admin_code:'applied'}});
  if(name==='ps_panel_recovery_label')return send({ok:true,label_version:1,ready:false,missing:['wifi_not_confirmed'],wifi_rotation_pending:false,label:null});
  if(name==='ps_admin_legacy_credentials_context')return send({ok:true,venue_id:V,device_id:A,legacy:false,print_server_id:RA,wifi_confirmed:true,admin_code_confirmed:true});
  if(name==='ps_panel_ota')return send({ok:true,print_servers:[{print_server_id:RA,installed_version:'0.3.28',update:detail(d).update}]});
  if(name==='ps_firmware_list')return send({ok:true,complete:true,total:0,installed:[],releases:[]});
  if(name==='ps-firmware-admin'&&args.action==='kit_list')return send({ok:true,kits:[]});
  report.unexpected.push({role,name});return send({ok:false,error:'unexpected_fixture_call'},400);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));
 const path=admin?`/admin/print-servers/devices/${A}`:`/?venue=${V}&section=print-servers&device=${A}`;
 await page.goto(origin+path);await expect(page.getByTestId('ps-open-portal')).toBeVisible();
 return {ctx,page,s,path};
}
try{
 for(const role of ['owner','admin'])for(const lang of ['en','es'])for(const width of [390,1440]){
  const {ctx,page,s}=await setup(role,width,lang);
  const about=page.getByTestId('ps-about');await expect(about).toContainText(lang==='es'?'Acerca de este Print Server':'About this Print Server');
  for(const value of ['PS-TEST6034','rpi4-2gb','arm64','0.3.28',s.host,'10.0.0.128:8443'])await expect(about).toContainText(value);
  await expect(about.locator('.ps-about-address a')).toHaveAttribute('href',s.url);
  const anchor=page.getByTestId('ps-open-portal');await expect(anchor).toHaveAttribute('href',s.url);await expect(anchor).toHaveAttribute('target','_blank');await expect(anchor).toHaveAttribute('rel','noopener noreferrer');
  await expect(page.getByTestId('ps-technical-details')).toHaveCount(0);
  if(role==='owner'){
   for(const id of ['ps-unlink','ps-stock','ps-setup','admin-device-channel','https-renew','dev-rotate-wifi'])await expect(page.getByTestId(id)).toHaveCount(0);
   assert(!s.calls.some(n=>n.startsWith('ps_admin_')||n==='ps_firmware_list'),'owner must not request administrative endpoints');
  }else {
   await expect(page.getByTestId('ps-unlink')).toBeVisible();
   await expect(page.getByTestId('ps-stock')).toContainText(lang==='es'?'Instalación y entrega':'Installation and delivery');
   await expect(page.getByTestId('ps-stock-state')).toBeVisible();
   await page.getByTestId('ps-stock-technical').locator('summary').click();
   await expect(page.getByTestId('ps-stock-technical')).toContainText('PS-TEST6034');
  }
  const diag=page.getByTestId('ps-diagnostics-details');await expect(diag).toHaveJSProperty('tagName','DETAILS');
  await diag.locator('summary').click();await expect(diag).not.toContainText(s.url);await expect(diag).not.toContainText('internal-note-must-not-render');
  await expect(diag.locator('details')).toHaveCount(0);
  await page.locator('a[href="#ps469-overview"]').click();
  const measures=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(measures.width,measures.scrollWidth);
  const shot=`${role}-${lang}-${width}.png`;await page.screenshot({path:`${out}/${shot}`,fullPage:true});
  report.views.push({role,lang,...measures,about:true,diagnosticDisclosure:true,portalUrl:s.url,adminControls:role==='admin',screenshot:shot});
  const other=lang==='es'?'en':'es';
  const marker=await page.evaluate(()=>window.__deviceDocument=123);
  await page.getByRole('button',{name:other.toUpperCase(),exact:true}).click();
  await expect(about).toContainText(other==='es'?'Acerca de este Print Server':'About this Print Server');
  assert.equal(await page.evaluate(()=>window.__deviceDocument),marker);
  await expect(page.locator('html')).toHaveAttribute('lang',other);
  const text=await page.locator('main').innerText();
  const leaked=text.match(/\b(?:psStock|psSetup|dev\.enroll|ps469|ps600)\.[a-zA-Z.]+/g); assert(!leaked,`no visible translation keys: ${leaked}`);
  report.states.push({role,width,from:lang,to:other,withoutReload:true});
  if(role==='admin') {
   s.nextStep='future_unknown_step';await page.reload();
   await expect(page.getByTestId('ps-stock-state')).toBeVisible();
   await expect(page.getByTestId('ps-stock-state')).not.toContainText('psStock.next.');
   await expect(page.getByTestId('ps-stock-state')).not.toContainText('future_unknown_step');
   report.states.push({role,width,unknownNextStep:'localized fallback'});
  }
  await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);report.pass=true;
} catch(e){report.failure=e.message;throw e;} finally {await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
