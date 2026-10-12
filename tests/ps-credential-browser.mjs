// PE-411: synthetic local fixtures, all external requests intercepted. No live authorization claim.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PS_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.PS_TEST_EVIDENCE??'docs/evidence/ps-credential-ux';await mkdir(out,{recursive:true});
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
 const state={sheet:{ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:{...device},wifi:{...wifi},rotations:[],cert:{},cert_operations:[],can_manage:true,is_platform_admin:true},reads:0,created:false,assigned:false,commands:[],mode:"ok",release:null};
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
  if(name==='ps_panel_rotate_wifi'||name==='ps_panel_rotate_admin_code'){
   assert.equal(args.p_venue_id,venueId);const kind=name.endsWith('_wifi')?'wifi':'admin_code',command_id='controlled-'+kind+'-'+(state.commands.length+1);
   state.commands.push({kind,command_id});
   if(state.mode==='hold')await new Promise(resolve=>state.release=resolve);
   if(state.mode==='fail')return send({ok:false,error:'device_offline'});
   if(state.mode==='missing')return send({ok:true});
   return send({ok:true,command_id});
  }
  if(name==='ps_panel_device'){state.reads++;if(state.readError)return send({code:state.readError==='denied'?'42501':'XX000',message:'Synthetic read error'},state.readError==='denied'?403:500);return send(state.sheet);}
  if(name==='ps_panel_ota')return send({ok:true,print_servers:[]});
  if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
  if(name==='portal_owner_venues')return send([]);
  return send(null);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/admin/print-servers/${venueId}?lang=${lang}`);await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);
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
  for(const button of await d.getByRole('button').all()){const r=await button.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=220);}
  await page.setViewportSize(v);
 }
}
try{
 for(const width of [390,1440]){
  const {ctx,page,state}=await setup(width);await page.clock.install();
  for(const [kind,action] of [['wifi','wifi'],['admin_code','code']]){
   const button=page.getByTestId('dev-rotate-'+action),status=page.getByTestId('dev-credential-status'),notice=page.getByTestId('dev-operation-'+kind);
   // Confirm then cancel must never send; sending stays distinct from acknowledgment.
   const before=state.commands.length;await button.click();await dialogBounds(page);await page.keyboard.press('Escape');assert.equal(state.commands.length,before);
   state.mode='hold';await button.click();await page.getByTestId('dev-confirm-accept').click();await expect(status).toHaveAttribute('data-phase','sending');await dialogBounds(page);
   await expect.poll(()=>state.release!==null).toBe(true);state.release();state.release=null;state.mode='ok';
   await expect(status).toHaveAttribute('data-phase','pending');await dialogBounds(page);await expect(button).toBeDisabled();
   // A different command and a matching id of the wrong kind cannot acknowledge this one.
   const command=state.commands.at(-1);state.sheet.rotations=[{...command,command_id:'older',status:'applied'},{...command,kind:kind==='wifi'?'admin_code':'wifi',status:'applied'}];
   await poll(page,state);await expect(status).toHaveAttribute('data-phase','pending');
   await page.screenshot({path:`${out}/rotation-${kind}-pending-${width}.png`});
   await page.getByTestId('dev-dialog-close').click();await expect(page.getByTestId('dev-confirm')).toHaveCount(0);await expect(notice).toHaveAttribute('data-phase','pending');
   await page.getByTestId('dev-admin-code').getByRole('button').last().click();await expect(page.getByTestId('dev-copy-result')).toBeVisible();
   state.sheet.rotations=[{...command,status:'applied',completed_at:'2026-01-02T00:00:00Z'}];
   await poll(page,state);await expect(notice).toHaveAttribute('data-phase','applied');await expect(page.getByTestId('dev-confirm')).toHaveCount(0);await expect(button).toBeEnabled();
   // New action: same modal updates to applied while open, without being recreated.
   await button.click();await page.getByTestId('dev-confirm-accept').click();await expect(status).toHaveAttribute('data-phase','pending');
   await page.getByTestId('dev-confirm').evaluate(el=>el.dataset.instance='same');
   state.readError=true;await poll(page,state);await expect(page.getByTestId('dev-confirm')).toHaveAttribute('data-instance','same');await expect(status).toHaveAttribute('data-phase','pending');
   state.readError=false;await poll(page,state);await expect(page.getByTestId('dev-confirm')).toHaveAttribute('data-instance','same');
   state.sheet.rotations=[{...state.commands.at(-1),status:'applied'}];await poll(page,state);
   await expect(status).toHaveAttribute('data-phase','applied');await expect(page.getByTestId('dev-confirm')).toHaveAttribute('data-instance','same');await dialogBounds(page);
   await page.screenshot({path:`${out}/rotation-${kind}-applied-${width}.png`});await page.getByTestId('dev-dialog-close').click();
   // Device failure in the same modal, followed by failure to submit.
   await button.click();await page.getByTestId('dev-confirm-accept').click();await expect(status).toHaveAttribute('data-phase','pending');
   state.sheet.rotations=[{...state.commands.at(-1),status:'failed',error_code:'device_offline'}];await poll(page,state);await expect(status).toHaveAttribute('data-phase','failed');await dialogBounds(page);
   await page.screenshot({path:`${out}/rotation-${kind}-failed-${width}.png`});await page.getByTestId('dev-dialog-close').click();
   state.mode='fail';await button.click();await page.getByTestId('dev-confirm-accept').click();await expect(status).toHaveAttribute('data-phase','failed');await page.getByTestId('dev-dialog-close').click();
   state.mode='missing';await button.click();await page.getByTestId('dev-confirm-accept').click();await expect(status).toHaveAttribute('data-phase','failed');await expect(status).toContainText('track');await page.getByTestId('dev-dialog-close').click();state.mode='ok';
   checks.push(`${width}px ${kind}: confirmation/cancel, sending, accepted pending, command_id+kind correlation, close pending remains in sheet, no poll reopening, same modal applied, device/request/tracking errors; transient polling failure preserves same modal; focus and footer within viewport`);
  }
  await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>Promise.reject(new Error('synthetic permission denied'))}));
  await page.getByTestId('dev-admin-code').getByRole('button').last().click();await expect(page.getByTestId('dev-copy-result')).toContainText('not');await expect(page.getByTestId('dev-copy-result')).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByTestId('dev-rotate-wifi').click();await page.getByTestId('dev-confirm-accept').click();await expect(page.getByTestId('dev-credential-status')).toHaveAttribute('data-phase','pending');
  state.readError='denied';await poll(page,state);await expect(page.getByTestId('dev-confirm')).toHaveCount(0);await expect(page.getByTestId('dev-psk')).toHaveCount(0);
  state.readError=false;await poll(page,state);await expect(page.getByTestId('dev-confirm')).toHaveCount(0);
  checks.push(`${width}px: access revocation clears modal and credentials; restored access never reopens modal; copy success/failure visible`);await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/credential-checks.json`,JSON.stringify({kind:'Controlled browser responses. No request reached a device.',checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
