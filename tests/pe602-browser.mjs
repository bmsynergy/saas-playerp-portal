// Runs on local preview or published DEV. ALL backend/auth traffic is synthetic and intercepted.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {fixture,inventory,venueDevice,detail,stockSheet,wifi,venues,when,A,B,N,V,W,RA,RB} from './fixtures/pe469.mjs';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out=process.env.PS_TEST_EVIDENCE??'docs/evidence/pe602/browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='f6020000-0000-4000-8000-000000000099',user={id:uid,email:'pe602@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const report={origin,backend:'All backend/auth requests intercepted; zero real mutations or device operations',checks:[],downloads:[],errors:[],unexpected:[]};
const sheet=id=>`/admin/print-servers/devices/${id}`;
async function setup(width=1440,lang='en',options={}){
 const ctx=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,serviceWorkers:'block'});
 await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
 const d=fixture(A,RA,options.stock?null:V,'0.3.28',true,'PE602 · Test bench','PS-TEST602A');
 d.link.rev=2;d.link.ack_rev=1;d.link.state=options.stock?'en_stock':'asignado_pendiente_sync';d.link.sync={scope:options.stock?'unlinked':'venue',rev:2,ack_rev:1,ack_at:null,confirmed:false,requires_capability:options.stock?'unlink_ack':'link_ack'};
 const s={d,calls:[],failRead:false,failAssign:false,confirmed:true,addError:null,canManage:true,scan:[],printers:[],old:!!options.old};
 const stock=()=>({ok:true,device_id:A,serial:d.serial,model:d.model,arch:'arm64',lifecycle:d.lifecycle,legacy:false,venue_id:d.venue?.id??null,link_state:d.link.state,stock:{state:s.confirmed?(d.venue?'validated_assigned':'validated_in_stock'):'enrolled_pending_confirmation',next_step:'assign',label_ready:s.confirmed,missing:[],checks:{credentials_confirmed_by_device:s.confirmed},credential:{print_server_id:RA,enrolled_at:when,permanent:true},reported:{hostname:d.runtime.hostname,firmware_version:'0.3.28',setup_url:'http://10.77.0.1',last_status_at:when,last_seen_at:when},file:s.old?null:{file_id:'fixture-file',instance_id:'fixture',issued_at:when,expires_at:when,sha256:'a'.repeat(64),bytes:200,consumed_by_device:true}}});
 await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),name=u.pathname.split('/').pop();
  if(u.origin===origin && ['GET','HEAD'].includes(req.method()))return route.continue();
  if(u.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(u.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  const args=req.postDataJSON()??{};s.calls.push({name,args});
  if(name==='is_platform_staff')return send(true);
  if(name==='portal_access')return send({is_platform_staff:true,platform_role:'super_admin',owner_venues:[]});
  if(name==='portal_tenant_directory')return send(venues);
  if(name==='portal_owner_venues')return send([]);
  if(name==='portal_tenant_detail')return send({venue:venues.find(v=>v.id===args.p_venue_id),print_servers:[]});
  if(name==='ps_admin_venue_search')return send({ok:true,venues:venues.map(v=>({...v,city:null,state:null,assigned_device:null}))});
  if(name==='ps_device_resolve')return s.failRead?send({message:'fixture read failure'},500):send(d);
  if(name==='ps_device_link_status')return send({ok:true,link:d.link});
  if(name==='portal_ps_devices')return send({ok:true,devices:[inventory(d)]});
  if(name==='ps_panel_devices')return send({ok:true,venue_id:V,can_manage:s.canManage,devices:[venueDevice(d)],unassigned_printers:[]});
  if(name==='ps_admin_stock_status')return send(stock());
  if(name==='ps_admin_stock_reserved_credentials')return send({ok:false,error:'forbidden'});
  if(name==='ps_admin_stock_label')return send(s.confirmed?{ok:true,label_version:1,label:{device_id:A,serial:d.serial,ssid:wifi(d).ssid,psk:wifi(d).psk,local_address:'http://10.77.0.1',wifi_qr:'WIFI:T:WPA;S:ignored;P:ignored;;',admin_code:'NOT_FOR_LABEL'}}:{ok:false,error:'device_not_confirmed'});
  if(name==='ps_firmware_list')return send({ok:true,complete:true,total:0,installed:[],releases:[]});
  if(name==='ps-firmware-admin'&&args.action==='kit_list')return send({ok:true,kits:[]});
  if(name==='ps_admin_device_detail'||name==='ps_admin_device_manage')return send(detail(d));
  if(name==='ps_admin_device_sheet'){
   const body=stockSheet(d),w=wifi(d);body.credentials={wifi:s.confirmed?{ssid:w.ssid,psk:w.psk,applied_at:when}:null,admin_code:null,pending_change:false};body.label={ready:s.confirmed,missing:s.confirmed?[]:['wifi_not_confirmed'],label:s.confirmed?{device_id:A,serial:d.serial,ssid:w.ssid,psk:w.psk,wifi_applied_at:when}:null};return send(body);
  }
  if(name==='ps_admin_device_assign'){
   assert.equal(args.p_device_id,A);assert.equal(args.p_venue_id,V);if(s.failAssign)return send({ok:false,error:'forbidden'});
   d.venue={id:V,name:venues[0].name};d.lifecycle='assigned';d.runtime.venue_id=V;Object.assign(d.link,{venue_id:V,venue_name:venues[0].name,lifecycle:'assigned',state:'asignado_pendiente_sync',rev:3,ack_rev:2,ack_at:null,sync:{scope:'venue',rev:3,ack_rev:2,ack_at:null,confirmed:false,requires_capability:'link_ack'}});d.capabilities.assign.allowed=false;s.failRead=true;
   return send({ok:true,device_id:A,venue_id:V,link:d.link});
  }
  if(name==='ps_panel_state')return send({venue_id:V,can_manage:s.canManage,print_server:{id:RA,label:d.label,hostname:d.runtime.hostname,device_id:A,status:'active',software_version:'0.3.28',online:true},printers:s.printers,pending_enrollment:null,last_scan:{command_id:'fixture-scan',status:'completed',result:{candidates:s.scan}}});
  if(name==='ps_panel_device')return send({ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:inventory(d),ps_online:true,wifi:s.confirmed?wifi(d):null,rotations:[],cert:{},cert_operations:[],can_manage:s.canManage,is_platform_admin:true});
  if(name==='ps_panel_recovery_label')return send({ok:true,label_version:1,ready:s.confirmed,missing:s.confirmed?[]:['wifi_not_confirmed'],wifi_rotation_pending:false,label:s.confirmed?{device_id:A,serial:d.serial,ssid:wifi(d).ssid,psk:wifi(d).psk,wifi_applied_at:when}:null});
  if(name==='ps_admin_legacy_credentials_context')return send({ok:true,venue_id:V,device_id:A,legacy:false,print_server_id:RA,wifi_confirmed:s.confirmed,admin_code_confirmed:s.confirmed});
  if(name==='ps_panel_ota')return send({ok:true,print_servers:[{print_server_id:RA,installed_version:'0.3.28',update:detail(d).update}]});
  if(name==='ps_panel_printer_jobs')return send({ok:true,jobs:[],total:0,limit:10,offset:0});
  if(name==='ps_panel_add_printer'){
   if(s.addError==='network')return route.abort();
   if(s.addError)return send({ok:false,...s.addError});
   const p={id:'fixture-created',label:args.p_label,mac_address:args.p_mac_address,print_server_id:RA,is_active:true,print_route:'ps',workstations:[],pending_jobs:0};s.printers.push(p);return send({ok:true,printer:p});
  }
  if(name==='ps_panel_set_printer_print_server'){assert.equal(args.p_print_server_id,RA);assert.equal(args.p_printer_id,'fixture-printer');s.addError=null;s.scan=[];return send({ok:true});}
  report.unexpected.push({name,args});return send({ok:false,error:'unexpected_fixture_call'},400);
 });
 await ctx.addInitScript(() => { window.__printChecks=[]; const append=Node.prototype.appendChild; Node.prototype.appendChild=function(node){const result=append.call(this,node);if(node instanceof HTMLIFrameElement)node.contentWindow.print=()=>{window.__printChecks.push({css:node.contentDocument.head.textContent,width:node.contentDocument.querySelector('img')?.naturalWidth});node.contentWindow.dispatchEvent(new Event('afterprint'));};return result;};});
 const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));return {ctx,page,s};
}
async function shot(page,file,target){await (target??page).screenshot({path:`${out}/${file}.png`,...(target?{}:{fullPage:true})});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow ${file}`);}
async function download(page,testid,file){const wait=page.waitForEvent('download');await (typeof testid==='string'?page.getByTestId(testid):testid).click();const d=await wait;await d.saveAs(`${out}/${file}`);const bytes=await readFile(`${out}/${file}`);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');let offset=8,physical=[];while(offset<bytes.length){const size=bytes.readUInt32BE(offset);if(bytes.toString('ascii',offset+4,offset+8)==='pHYs')physical.push([bytes.readUInt32BE(offset+8),bytes.readUInt32BE(offset+12),bytes[offset+16]]);offset+=size+12;}assert.deepEqual(physical,[[11811,11811,1]]);const png=PNG.sync.read(bytes);assert.equal(png.width,590);assert.equal(png.height,354);assert.equal(jsQR(new Uint8ClampedArray(png.data),590,354)?.data,'WIFI:T:WPA;S:PlayERP-Setup-TEST602A;P:1234567890;;');report.downloads.push({file,filename:d.suggestedFilename(),header:bytes.subarray(0,8).toString('hex'),width:png.width,height:png.height,pHYs:physical[0],qr:'exact Wi-Fi fixture payload decoded'});return d.suggestedFilename();}
try{
 const {ctx,page,s}=await setup(1440,'en',{stock:true});await page.goto(origin+sheet(A));await expect(page.getByTestId('ps-stock-get-label')).toBeEnabled();
 await page.getByTestId('ps-stock-get-label').click();await expect(page.getByTestId('ps-stock-label')).toBeVisible();await shot(page,'label-stock',page.getByTestId('ps-stock-label'));
 await download(page,'ps-stock-download-label','download-stock.png');await page.getByTestId('ps-stock-print-label').click();await expect.poll(()=>page.evaluate(()=>window.__printChecks.length)).toBe(1);assert.match((await page.evaluate(()=>window.__printChecks))[0].css,/size:50mm 30mm;margin:0/);
 s.confirmed=false;await page.reload();await expect(page.getByTestId('ps-stock-get-label')).toBeDisabled();await expect(page.getByTestId('ps-stock-download-label')).toBeDisabled();await expect(page.getByTestId('ps-stock-print-label')).toBeDisabled();
 s.confirmed=true;await page.reload();await page.getByTestId('ps469-assign-venue').fill('Laboratorio');await page.getByRole('option').filter({hasText:'Laboratorio'}).click();
 await page.getByTestId('ps469-assign').click();await expect(page.getByTestId('ps-assignment-read-warning')).toBeVisible();await expect(page.getByText('Link saved for',{exact:false})).toBeVisible();await expect(page.getByTestId('ps-unlink-error')).toHaveCount(0);await expect(page.getByTestId('ps-link-sync')).toContainText('waiting for synchronization');await shot(page,'assignment-pending');
 s.failRead=false;await page.getByRole('button',{name:'Retry reading',exact:true}).click();await expect(page.getByTestId('ps-assignment-read-warning')).toHaveCount(0);assert.equal(s.calls.filter(c=>c.name==='ps_admin_device_assign').length,1);
 s.d.link.state='sincronizado';s.d.link.ack_rev=3;s.d.link.ack_at=when;Object.assign(s.d.link.sync,{ack_rev:3,ack_at:when,confirmed:true});await page.reload();await expect(page.getByTestId('ps-link-sync')).toContainText('Link synchronized');await shot(page,'assignment-synced');
 report.checks.push('Stock PNG download header+decode and confirmation gate; saved assignment survives failed read; retry only reads; sync only after fixture ACK');await ctx.close();

 for(const width of [390,1440])for(const lang of ['en','es']){
  const {ctx,page,s}=await setup(width,lang);
  const existing={printer_id:'fixture-printer',printer_label:'Kitchen fixture',venue_id:V,venue_name:venues[0].name,print_server_id:RB,print_server_label:'PS fixture previous'};
  s.scan=[{mac_address:'AA:BB:CC:11:22:33',local_address:'192.0.2.3',port:9100,reachable:true,scope:'other_ps',existing}];
  await page.goto(origin+sheet(A));const row=page.getByTestId('scan-candidate-AA:BB:CC:11:22:33');await expect(row).toContainText('Kitchen fixture');await expect(row.locator('[data-testid^="scan-add-"]')).toHaveCount(0);await shot(page,`scan-${lang}-${width}`,row);
  await page.getByTestId('printers-toggle').click();await page.getByTestId('printer-add').click();
  await page.getByTestId('printer-form-submit').click();await expect(page.getByTestId('printer-form-error')).toBeFocused();
  await page.getByTestId('printer-form-label').fill('Keep my draft');await page.getByTestId('printer-form-mac').fill('not-a-mac');await page.getByTestId('printer-form-submit').click();await expect(page.getByTestId('printer-form-error')).toBeVisible();
  await page.getByTestId('printer-form-mac').fill('AA-BB-CC-99-88-77');s.addError={error:'mac_already_registered',scope:'other_ps',existing};
  await page.getByTestId('printer-form-submit').click();await page.getByTestId('confirm-accept').click();await expect(page.getByTestId('confirm-accept')).toHaveCount(0);await expect(page.getByTestId('printer-form-error')).toContainText('Kitchen fixture');await expect(page.getByTestId('printer-form-error')).toBeFocused();await expect(page.getByTestId('printer-form-label')).toHaveValue('Keep my draft');await expect(page.getByTestId('action-result')).not.toHaveAttribute('data-ok','false');
  await shot(page,`duplicate-${lang}-${width}`,page.getByTestId('printer-form'));
  const moveName=lang==='en'?'Move to this Print Server':'Mover a este Print Server';
  await page.getByTestId('printer-form-error').getByRole('button',{name:moveName,exact:true}).click();assert.equal(s.calls.filter(c=>c.name==='ps_panel_set_printer_print_server').length,0);await page.getByTestId('confirm-accept').click();await expect(page.getByTestId('confirm-accept')).toHaveCount(0);await expect(page.getByTestId('printer-form-error')).toHaveCount(0);assert.equal(s.calls.filter(c=>c.name==='ps_panel_set_printer_print_server').length,1);
  // Cross-venue with authorized identifying data: link yes, transfer no.
  s.addError={error:'mac_already_registered',scope:'other_venue',existing:{...existing,venue_id:W,venue_name:'Authorized other venue'}};
  await page.getByTestId('printer-form-mac').fill('AA:BB:CC:99:88:76');await page.getByTestId('printer-form-submit').click();await page.getByTestId('confirm-accept').click();await expect(page.getByTestId('confirm-accept')).toHaveCount(0);const error=page.getByTestId('printer-form-error');await expect(error).toContainText('Authorized other venue');await expect(error.locator('a')).toHaveAttribute('href',new RegExp(W));await expect(error.getByRole('button',{name:moveName,exact:true})).toHaveCount(0);
  await shot(page,`other-venue-${lang}-${width}`,page.getByTestId('printer-form'));
  // No authorized details means no identifying data or management/move controls.
  s.addError={error:'mac_already_registered',scope:'other_venue'};await page.getByTestId('printer-form-mac').fill('AA:BB:CC:99:88:75');await page.getByTestId('printer-form-submit').click();await page.getByTestId('confirm-accept').click();await expect(page.getByTestId('confirm-accept')).toHaveCount(0);await expect(error).not.toContainText('Kitchen fixture');await expect(error.locator('a,button')).toHaveCount(0);
  for(const failure of [{error:'forbidden'},'network']){s.addError=failure;await page.getByTestId('printer-form-mac').fill(failure==='network'?'AA:BB:CC:99:88:73':'AA:BB:CC:99:88:74');await page.getByTestId('printer-form-submit').click();await page.getByTestId('confirm-accept').click();await expect(page.getByTestId('confirm-accept')).toHaveCount(0);await expect(error).toBeVisible();await expect(error).toBeFocused();await expect(page.getByTestId('printer-form-label')).toHaveValue('Keep my draft');}
  s.addError=null;await page.getByTestId('printer-form-submit').click();await page.getByTestId('confirm-accept').click();await expect(page.getByTestId('confirm-accept')).toHaveCount(0);await expect(error).toHaveCount(0);await expect(page.getByTestId('printer-label-fixture-created')).toHaveText('Keep my draft');
  report.checks.push(`${lang} ${width}px: scan registered; local validation/duplicate/permission/network errors preserve draft and focus; authorized cross venue link only; no details no leak; move confirmation existing action; retry creates new MAC and clears error`);await ctx.close();
 }

 // Duplicate scope is location, not permission; no PS is not the current PS.
 {const {ctx,page,s}=await setup();const base={printer_id:'fixture-printer',printer_label:'Registered fixture',venue_id:V,venue_name:venues[0].name,print_server_id:RA,print_server_label:'Current PS'};
 s.scan=[{mac_address:'AA:00:00:00:00:01',reachable:true,scope:'same_ps',existing:base},{mac_address:'AA:00:00:00:00:02',reachable:true,scope:'other_venue',existing:{...base,venue_id:W,venue_name:'Other authorized venue'}},{mac_address:'AA:00:00:00:00:03',reachable:false,scope:'other_venue',registered_elsewhere:true},{mac_address:'AA:00:00:00:00:04',reachable:true,scope:'other_ps',existing:{...base,print_server_id:null,print_server_label:null}},{mac_address:'AA:00:00:00:00:05',reachable:true}];
 await page.goto(origin+sheet(A));for(const suffix of ['01','02','03','04'])await expect(page.getByTestId(`scan-add-AA:00:00:00:00:${suffix}`)).toHaveCount(0);
 const hidden=page.getByTestId('scan-candidate-AA:00:00:00:00:03');await expect(hidden.locator('a,button')).toHaveCount(0);await expect(hidden).not.toContainText('Registered fixture');await expect(hidden).not.toContainText('connection worked');
 const noPs=page.getByTestId('scan-candidate-AA:00:00:00:00:04');await expect(noPs.locator('a')).toHaveAttribute('href',`/admin/tenants/${V}/print-servers`);await expect(noPs.getByRole('button')).toHaveCount(0);
 await page.getByTestId('printers-toggle').click();await page.getByTestId('printer-add').click();await page.getByTestId('printer-form-label').fill('Duplicate same PS');await page.getByTestId('printer-form-mac').fill('aa0000000001');await expect(page.getByTestId('printer-form-submit')).toBeDisabled();await expect(page.getByTestId('printer-form-known-registered')).toContainText('Current PS');assert.equal(s.calls.filter(c=>c.name==='ps_panel_add_printer').length,0);
 s.canManage=false;await page.reload();await expect(page.getByTestId('printer-add')).toHaveCount(0);await expect(page.getByRole('button',{name:'Move to this Print Server',exact:true})).toHaveCount(0);
 s.canManage=true;await page.reload();await page.getByTestId('scan-add-AA:00:00:00:00:05').click();await page.getByTestId('printer-form-label').fill('From scan');s.addError={error:'forbidden'};await page.getByTestId('printer-form-submit').click();await page.getByTestId('confirm-accept').click();await expect(page.getByTestId('confirm-accept')).toHaveCount(0);await expect(page.getByTestId('printer-form-error')).toBeFocused();await expect(page.getByTestId('printer-form-mac')).toHaveValue('AA:00:00:00:00:05');report.checks.push('Same PS normalized MAC caught without RPC; scan same/other venue authorized and hidden, absent PS, read-only manager, scan-prefill error at form');await ctx.close();}
 // Old inventory and assigned label surfaces keep PNG exports and confirmation gates.
 for(const stock of [true,false]){
  const {ctx,page,s}=await setup(1440,'en',{stock,old:true});await page.goto(origin+sheet(A));
  if(stock){const section=page.locator('section[aria-labelledby="stock-label"]');await expect(section).toBeVisible();await download(page,section.getByRole('button',{name:'Download',exact:true}),'download-inventory.png');await section.getByRole('button',{name:'Preview',exact:true}).click();await expect(section.locator('img')).toBeVisible();await section.getByRole('button',{name:'Print label',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__printChecks.length)).toBe(1);s.confirmed=false;await page.reload();await expect(section.getByRole('button',{name:'Download',exact:true})).toBeDisabled();}
  else{await expect(page.getByTestId('dev-label-download')).toBeEnabled();await download(page,'dev-label-download','download-assigned.png');await page.getByTestId('dev-label-preview-action').click();await expect(page.getByTestId('dev-label-preview-image')).toBeVisible();await page.getByTestId('dev-label-print').click();await expect.poll(()=>page.evaluate(()=>window.__printChecks.length)).toBe(1);s.confirmed=false;await page.reload();await expect(page.getByTestId('dev-label-download')).toBeDisabled();}
  report.checks.push(`${stock?'inventory':'assigned'} legacy surface: PNG download, disabled without confirmed Wi-Fi`);await ctx.close();
 }
 // Mutation failure is visibly red and never shows saved success.
 {const {ctx,page,s}=await setup(1440,'en',{stock:true});s.failAssign=true;await page.goto(origin+sheet(A));await page.getByTestId('ps469-assign-venue').fill('Laboratorio');await page.getByRole('option').filter({hasText:'Laboratorio'}).click();await page.getByTestId('ps469-assign').click();await expect(page.getByTestId('ps-unlink-error')).toBeVisible();await expect(page.getByText('Link saved for',{exact:false})).toHaveCount(0);report.checks.push('Failed assignment mutation displays real error without success');await ctx.close();}
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);
 report.pass=true;
}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
