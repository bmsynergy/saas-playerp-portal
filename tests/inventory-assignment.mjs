// Focalized inventory/credential checks. Every API request is intercepted.
// No authorization claim about the live database; no persistent fixtures or device operations.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const stockFixture=JSON.parse(await readFile(new URL('./fixtures/admin-device-stock.json',import.meta.url),'utf8'));
const origin = process.env.PS_TEST_ORIGIN ?? 'http://127.0.0.1:18799';
const out = process.env.PS_TEST_EVIDENCE ?? 'docs/evidence/inventory-assignment';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const uid = '11111111-1111-4111-8111-111111111111';
const venueId = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-01-03T10:00:00Z', requested = '2026-01-03T09:00:00Z';
const user = { id: uid, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {} };
const exp = Math.floor(Date.now()/1000)+3600, enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const session = { access_token: `${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.synthetic`, refresh_token:'synthetic', expires_at:exp, expires_in:3600, token_type:'bearer', user };
const venue = { id: venueId, name:'Fixture Park', slug:'fixture', is_active:true };
const device = i => ({ id:`33333333-3333-4333-8333-33333333333${i}`, serial:`PS-AAAAAAA${i}`, hostname:`playerp-ps-aaaaaaa${i}`, label:`Fixture ${i}`, model:'rpi4-2gb', arch:'arm64', legacy:false,
  status:i<2?'assigned':'stock', venue_id:i<2?venueId:null, venue_name:i<2?venue.name:null, print_server_id:i<2?`44444444-4444-4444-8444-44444444444${i}`:null, software_version:'0.3.21', created_at:stamp });
const report = { origin, portalSha:process.env.PS_TEST_SHA??'local', backendSha:'cb0dbe09c7eeb12dd587164b9ebf2d5cf75d19ce', safety:'Intercepted fixtures only; no real mutations or physical operations.', checks:[], errors:[] };
async function setup(width, owner=false) {
  const ctx = await browser.newContext({ viewport:{width,height:844} });
  await ctx.addInitScript(session => { localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session)); localStorage.setItem('playerp.locale','en'); },session);
  const s = { devices:[device(0),device(1),device(2)], calls:[], retiredPermission:true, terminal:true, denied:false, ssid:'applied', rotations:[], mutateError:false, stockEmpty:false, stockMismatch:false, stockDelay:0 };
  const psFor = d => ({id:d.print_server_id,label:d.label,hostname:d.hostname,device_id:d.id,status:'active',software_version:d.software_version,online:true,last_seen_at:stamp});
  const detail = d => ({ok:true,device:d,actions:{assign:{allowed:!d.venue_id,reason:null},move:{allowed:!!d.venue_id,reason:null},unassign:{allowed:!!d.venue_id,reason:null},delete:{allowed:true,confirm_with:'serial'},...(s.retiredPermission?{retire:{allowed:d.status!=='retired'&&!d.legacy,confirm_with:'serial',revoke_reason:'retired',reason:d.status==='retired'?'device_retired':null}}:{})},
    update:{current_version:d.software_version,latest_stable:null,candidate:null,effective_ring:null,can_update:false,update_available:false,reason:'device_not_active',active_update:null},delete:{allowed:false,blockers:['device_assigned']}});
  await ctx.route('**/*',async route => {
    const url=new URL(route.request().url());
    if(url.origin===origin)return route.continue();
    if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
    const name=url.pathname.split('/').pop(), send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(url.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
    if(name==='staff_profiles')return send(null);
    const args=route.request().postDataJSON()??{};s.calls.push({name,args});
    if(name==='portal_access')return send({is_platform_staff:!owner,platform_role:owner?null:'super_admin',owner_venues:owner?[venue]:[]});
    if(name==='is_platform_staff')return send(!owner);
    if(name==='portal_tenant_directory'||name==='portal_owner_venues')return send([venue]);
    if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
    if(name==='portal_ps_devices')return owner?send({code:'42501'},403):send({ok:true,devices:s.devices});
    if(name==='ps_firmware_list')return send({releases:[],installed:[]});
    if(name==='ps_admin_legacy_credentials_context')return send({code:'42501'},403);
    if(name==='ps_admin_wifi_ssid_adopt')return send({ok:true,state:'applied',already:true,canonical_ssid:'PlayERP-Setup-ABCDEFGH',current_ssid:'PlayERP-Setup-ABCDEFGH'});
    if(name==='portal_ps_inventory')return send({contract_version:1,generated_at:stamp,online_window_seconds:180,items:s.devices.map(d=>({id:d.print_server_id??d.id,device_id:d.id,serial:d.serial,label:d.label,hostname:d.hostname,assignment:d.venue_id?'assigned':'unassigned',venue_id:d.venue_id,venue_name:d.venue_name,last_venue_name:null,connection:d.venue_id?'online':'unassigned',last_seen_at:stamp,last_report_at:stamp,firmware_version:d.software_version,firmware_known:true,error_count:0,warning_count:0,printers_total:0,pending_jobs:0,last_issue_at:null,issues:[]}))});
    if(name==='ps_admin_device_sheet') {
      if(s.stockDelay)await new Promise(resolve=>setTimeout(resolve,s.stockDelay));
      if(owner||s.denied)return send({code:'42501'},403);
      assert.equal(args.p_device_id,device(2).id);
      const f=structuredClone(stockFixture);
      if(s.stockMismatch)f.device.id=device(0).id;
      if(s.stockEmpty){f.credentials={wifi:null,wifi_reason:'wifi_not_confirmed',admin_code:null,admin_code_reason:'admin_code_not_confirmed',pending_change:false};f.label={ready:false,missing:['wifi_not_confirmed'],label:null};f.scans={items:[],reason:'no_scans_recorded'};f.jobs={total:0,by_status:{},recent:[],reason:'no_jobs_recorded'};f.cert={status:'none',reason:'no_cert_reported'};f.operations=[];f.ota=[];f.assignments=[];f.audit=[];}
      return send(f);
    }
    if(name==='ps_admin_device_detail'||name==='ps_admin_device_manage')return owner?send({code:'42501'},403):send(detail(s.devices.find(d=>d.id===args.p_device_id)));
    if(name==='ps_admin_venue_search') {
      const venues=Array.from({length:20},(_,i)=>({id:i===0?venueId:`55555555-5555-4555-8555-${String(i).padStart(12,'0')}`,name:i===0?venue.name:`Park ${String(i).padStart(2,'0')}`,slug:`park-${i}`,city:'Ponce',state:'PR',is_active:true,assigned_device:i===0?{id:device(0).id,serial:device(0).serial}:null}));
      return send({ok:true,venues:venues.filter(v=>!args.p_query||v.name.toLowerCase().includes(args.p_query.toLowerCase()))});
    }
    if(name==='ps_admin_device_assign'||name==='ps_admin_device_move') {
      assert.equal(owner,false); assert.equal('p_print_server_id' in args,false);
      if(s.mutateError)return send({ok:false,error:'unknown_venue'});
      const d=s.devices.find(d=>d.id===args.p_device_id);d.venue_id=args.p_venue_id;d.venue_name=venue.name;d.status='assigned';d.print_server_id='44444444-4444-4444-8444-444444444442';
      return send({ok:true,enrollment_code:'SYNTHETIC-NOT-REAL',expires_at:stamp,replaces_device_id:null});
    }
    if(name==='ps_admin_device_revoke') {
      assert.equal(owner,false);assert.ok(['portal_admin','retired'].includes(args.p_reason));
      const d=s.devices.find(d=>d.id===args.p_device_id);d.venue_id=null;d.venue_name=null;d.print_server_id=null;d.status=args.p_reason==='retired'?'retired':'stock';return send({ok:true});
    }
    if(name==='ps_device_sheet_resolve') {
      const d=s.devices.find(d=>[d.id,d.print_server_id].includes(args.p_id));
      if(!d||owner&&(!d.venue_id||s.denied))return send({code:'42501'},403);
      return send({ok:true,kind:args.p_id===d.id?'inventory':'print_server',inventory_device_id:d.id,print_server_id:d.print_server_id,venue_id:d.venue_id,venue_name:d.venue_name,status:d.status,can_manage:!!d.venue_id,is_staff:!owner});
    }
    if(name==='ps_panel_devices')return send({ok:true,venue_id:venueId,can_manage:true,devices:s.devices.filter(d=>d.venue_id===venueId).map(d=>({...d,id:d.print_server_id,inventory_device_id:d.id,online:true,printers_total:0})),unassigned_printers:[]});
    if(name.startsWith('ps_panel_')) {
      const d=s.devices.find(d=>d.print_server_id===args.p_print_server_id);
      if(!d||s.denied)return send({code:'42501'},403);
      assert.equal(args.p_venue_id,d.venue_id);
      if(name==='ps_panel_state')return send({venue_id:venueId,can_manage:true,print_server:psFor(d),printers:[],pending_enrollment:null,last_scan:null});
      if(name==='ps_panel_ota')return send({ok:true,print_servers:[]});
      const wifi={ssid:`PlayERP-Setup-AAAAAAA${d.serial.slice(-1)}`,psk:'0123456789',admin_code:'ABCDE23456',wifi_applied_at:stamp,admin_code_applied_at:stamp};
      if(name==='ps_panel_device')return send({ok:true,print_server_id:d.print_server_id,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:d,ps_online:true,wifi,rotations:s.rotations.length?s.rotations:['wifi','admin_code'].map(kind=>({command_id:`fixture-${kind}`,kind,status:s.terminal?'applied':'pending',requested_at:requested,completed_at:s.terminal?stamp:null})),cert:{},cert_operations:[],can_manage:true,is_platform_admin:!owner,
        enroll_credentials:{state:s.terminal?'applied':'pending',wifi:s.terminal?'applied':'pending',admin_code:s.terminal?'applied':'pending',acked_at:s.terminal?stamp:null},
        wifi_ssid_adoption:{canonical_ssid:'PlayERP-Setup-ABCDEFGH',current_ssid:wifi.ssid,state:s.ssid,reprint_label:true,command_id:'ssid-command',requested_at:requested,completed_at:s.ssid==='applied'?stamp:null}});
      if(name==='ps_panel_recovery_label')return send({ok:true,label_version:1,ready:true,missing:[],wifi_rotation_pending:!s.terminal,label:{device_id:d.id,serial:d.serial,ssid:wifi.ssid,psk:wifi.psk,wifi_applied_at:stamp}});
      if(name==='ps_panel_rotate_wifi'||name==='ps_panel_rotate_admin_code') {const kind=name.endsWith('_wifi')?'wifi':'admin_code';s.rotations=[{command_id:`rotation-${kind}`,kind,status:'pending',requested_at:requested,completed_at:null}];return send({ok:true,command_id:`rotation-${kind}`});}
      if(name==='ps_panel_adopt_wifi_ssid')return send({ok:true,state:'applied',already:true,canonical_ssid:'PlayERP-Setup-ABCDEFGH',current_ssid:'PlayERP-Setup-ABCDEFGH'});
    }
    report.errors.push(`Unexpected ${name}`);return route.abort();
  });
  const page=await ctx.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>report.errors.push(e.message));
  return {ctx,page,s};
}
const href=(d,owner)=>owner?`/?venue=${venueId}&section=print-servers&device=${d.print_server_id??d.id}`:`/admin/print-servers/devices/${d.print_server_id??d.id}`;
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth).then(v=>assert.ok(v,'horizontal overflow'));
try {
  for(const width of [390,1440]) {
    const {ctx,page,s}=await setup(width);
    await page.goto(origin+'/admin/print-servers/inventory');
    const trigger=page.getByTestId(`inv-manage-${device(2).serial}`);
    await trigger.click();const dialog=page.getByTestId('admin-device-manage-dialog');
    await expect(dialog.getByRole('heading',{name:'Assignment',exact:true})).toBeVisible();
    const input=page.getByTestId('inv-manage-venue');await input.click();
    const list=page.getByRole('listbox');await expect(list.getByRole('option')).toHaveCount(21);
    const geometry=await page.evaluate(()=>{const l=document.querySelector('[role=listbox]'),f=document.querySelector('.ps-dialog-actions'),a=l.getBoundingClientRect(),b=f.getBoundingClientRect();return {portal:l.parentElement===document.body,top:a.top,bottom:a.bottom,footerTop:b.top,footerBottom:b.bottom,height:innerHeight,scroll:l.scrollHeight>l.clientHeight};});
    assert.ok(geometry.portal&&geometry.top>=0&&geometry.bottom<=geometry.footerTop&&geometry.footerBottom<=geometry.height&&geometry.scroll,JSON.stringify(geometry));
    for(let i=0;i<18;i++)await input.press('ArrowDown');
    assert.ok(await list.evaluate(e=>e.scrollTop)>0,'arrow keys scroll active option');
    await input.press('ArrowUp');await input.press('Enter');await expect(list).toHaveCount(0);
    await input.click();await input.fill('Fixture');await expect(list.getByRole('option')).toHaveCount(2);
    await page.screenshot({path:`${out}/assignment-${width}.png`});
    await input.press('Escape');await expect(list).toHaveCount(0);await expect(dialog).toBeVisible();
    await input.click();await input.press('Tab');await expect(list).toHaveCount(0);
    await input.click();await input.fill('Fixture');await expect(list.getByRole('option')).toHaveCount(2);await input.press('ArrowDown');await input.press('Enter');
    await page.getByTestId('inv-manage-assign').click();await expect(dialog).toContainText(device(2).serial);await expect(dialog).toContainText('will remain assigned');
    assert.equal(s.calls.filter(c=>c.name==='ps_admin_device_assign').length,0,'confirmation precedes mutation');
    await page.getByTestId('inv-confirm-assign').click();await page.getByTestId('inv-code-close').click();
    assert.equal(s.devices[0].print_server_id,device(0).print_server_id);assert.equal(s.devices[1].print_server_id,device(1).print_server_id);
    await trigger.click();await input.fill('Park 19');await expect(list.getByRole('option')).toHaveCount(2);await input.press('ArrowDown');await input.press('Enter');
    await page.getByTestId('inv-manage-assign').click();await expect(dialog).toContainText('Park 19');await expect(dialog).not.toContainText('{venue}');
    s.mutateError=true;await page.getByTestId('inv-confirm-assign').click();await expect(dialog.locator('.form-error')).toBeVisible();assert.equal(s.devices[2].venue_id,venueId);
    s.mutateError=false;await page.getByTestId('inv-confirm-assign').click();await page.getByTestId('inv-code-close').click();
    assert.equal(s.devices[0].print_server_id,device(0).print_server_id);assert.equal(s.devices[1].print_server_id,device(1).print_server_id);
    await trigger.click();await dialog.getByRole('button',{name:'Unassign',exact:true}).click();await expect(dialog).toContainText(venue.name);await page.getByTestId('inv-confirm-unassign').click();
    await trigger.click();await dialog.getByRole('button',{name:'Retire',exact:true}).click();await expect(page.getByTestId('inv-confirm-retire')).toBeDisabled();await dialog.getByRole('textbox').fill(device(2).serial);await page.getByTestId('inv-confirm-retire').click();await expect(dialog).toHaveCount(0);
    assert.equal(s.devices[2].status,'retired');assert.equal(s.calls.filter(c=>c.name==='ps_admin_device_delete').length,0);
    await trigger.click();await expect(dialog.getByRole('button',{name:'Retire',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
    s.devices[2]=device(2);s.retiredPermission=false;await page.reload();await trigger.click();await expect(dialog.getByRole('button',{name:'Retire',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
    await page.getByTestId(`inv-open-${device(2).serial}`).click();await expect(page).toHaveURL(origin+href(device(2),false));await expect(page.getByTestId('inventory-device-identity')).toContainText(device(2).serial);await noOverflow(page);
    const stock=page.getByTestId('inventory-device-sheet');
    await expect(stock).toContainText('Historical Park');
    await expect(page.getByTestId('stock-sheet-jobs')).toContainText('7');
    await expect(page.getByTestId('stock-sheet-scans')).toContainText('completed');
    await expect(page.getByTestId('stock-sheet-operations')).toContainText('wifi_rotate');
    await expect(page.getByTestId('stock-sheet-ota')).toContainText('0.3.21');
    await expect(page.getByTestId('stock-sheet-audit')).toContainText('device_revoke');
    await expect(stock).not.toContainText('0123456782');await expect(stock).not.toContainText('STOCK-CONFIRMED-CODE');await expect(stock).not.toContainText('MUST-NOT-PROJECT');
    await expect(stock.getByRole('button',{name:'Print label',exact:true})).toHaveCount(1);
    await expect(stock.getByRole('button',{name:'Check status',exact:true})).toHaveCount(0);
    const reveals=stock.getByRole('button',{name:'Show confirmed value',exact:true});
    await reveals.first().click();await expect(stock).toContainText('0123456782');
    await stock.getByRole('button',{name:'Hide confirmed value',exact:true}).click();
    await stock.getByRole('button',{name:'Preview',exact:true}).click();await expect(stock.locator('.dev-label-preview img')).toBeVisible();
    await noOverflow(page);await page.screenshot({path:`${out}/stock-identity-${width}.png`,fullPage:true});
    s.stockEmpty=true;await page.reload();await expect(stock).toContainText('No jobs have been recorded.');await expect(stock).toContainText('No scans have been recorded.');await expect(stock).toContainText('No certificate has been reported.');
    await expect(stock.getByRole('button',{name:'Print label',exact:true})).toHaveCount(0);
    s.stockMismatch=true;await page.reload();await expect(page.locator('.state-denied')).toBeVisible();await expect(stock).toHaveCount(0);
    s.stockMismatch=false;s.stockEmpty=false;await page.reload();await expect(stock).toBeVisible();
    await stock.getByRole('button',{name:'Show confirmed value',exact:true}).first().click();await expect(stock).toContainText('0123456782');
    s.stockDelay=1200;s.denied=true;
    await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
    await expect(stock).toHaveCount(0);await expect(page.locator('body')).not.toContainText('0123456782');
    await expect(page.locator('.state-denied')).toBeVisible();


    report.checks.push({width,criterion:1,modal:'portal, collision, scroll, keyboard, confirmation and focus return pass',geometry});
    report.checks.push({width,criterion:2,fixtureOnly:true,firstTwoPreserved:true,stockAndRetired:true,payloads:s.calls.filter(c=>['ps_admin_device_assign','ps_admin_device_move','ps_admin_device_revoke'].includes(c.name))});
    await ctx.close();
  }
  for(const owner of [false,true])for(const width of [390,1440]) {
    const {ctx,page,s}=await setup(width,owner);
    for(const d of [device(0),device(1)]) {
      await page.goto(origin+href(d,owner));await expect(page.getByTestId('dev-serial')).toHaveText(d.serial);await expect(page).toHaveURL(origin+href(d,owner));
      await expect(page.getByTestId('dev-label-replacement-ready')).toBeVisible();await expect(page.getByTestId('dev-label-replacement-ready').getByRole('button')).toHaveCount(0);await expect(page.getByTestId('dev-label-print')).toHaveCount(1);
      await expect(page.getByRole('button',{name:'Check status',exact:true})).toHaveCount(0);await expect(page.getByTestId('dev-enroll')).toHaveAttribute('data-state','applied');
      await expect(page.getByTestId('dev-qr')).toHaveCount(0);await noOverflow(page);
    }
    await page.getByTestId('ps-device-panel').screenshot({path:`${out}/${owner?'owner':'admin'}-terminal-${width}.png`});
    // Exercise the same terminal rule in both rotation dialogs using intercepted commands.
    for(const [kind,button] of [['wifi','dev-rotate-wifi'],['admin_code','dev-rotate-code']]) {
      await page.getByTestId(button).click();await page.getByTestId('dev-confirm-accept').click();
      const progress=page.getByTestId(`dev-rotation-dialog-status-${kind}`);
      await expect(progress.getByRole('button',{name:'Check status',exact:true})).toBeVisible();
      s.rotations=s.rotations.map(o=>({...o,status:'applied',completed_at:stamp}));
      // Polling may already remove the button after the fixture turns applied.
      await progress.evaluate(el=>el.querySelector('button')?.click());
      await expect(progress).toHaveAttribute('data-phase','applied');await expect(progress.getByRole('button')).toHaveCount(0);
      await expect(progress.locator('.credential-progress-dates')).toContainText('2026');await page.getByTestId('dev-dialog-close').click();s.rotations=[];
    }
    if(!owner) {
      s.ssid='available';await page.reload();await page.getByTestId('adopt-open').click();
      await expect(page.getByTestId('adopt-sent')).toContainText('Applied');await expect(page.getByTestId('adopt-dialog').getByRole('button',{name:'Check status',exact:true})).toHaveCount(0);
      await page.getByTestId('adopt-dialog').getByRole('button',{name:'Close',exact:true}).click();
    }
    // An inventory ID with an active PS also resolves to the full per-PS sheet.
    if(!owner) {await page.goto(`${origin}/admin/print-servers/devices/${device(0).id}`);await expect(page.getByTestId('dev-serial')).toHaveText(device(0).serial);}
    s.terminal=false;s.ssid='pending';await page.reload();await expect(page.getByRole('button',{name:'Check status',exact:true})).toHaveCount(2);
    await page.getByTestId('ps-device-panel').screenshot({path:`${out}/${owner?'owner':'admin'}-pending-${width}.png`});
    s.denied=true;await page.reload();await expect(page.locator('.state-denied')).toBeVisible();await expect(page.getByTestId('dev-serial')).toHaveCount(0);await expect(page.getByTestId('dev-psk')).toHaveCount(0);
    if(owner) {await page.goto(origin+href(device(2),true));await expect(page.locator('.state-denied')).toBeVisible();await expect(page.getByTestId('inventory-device-identity')).toHaveCount(0);assert.equal(s.calls.filter(c=>['ps_admin_device_detail','ps_admin_device_sheet'].includes(c.name)).length,0);}
    report.checks.push({role:owner?'owner':'admin',width,criterion:3,assignedSheets:'two distinct PS URLs and identities, explicit per-PS RPCs',deniedFixture:'no credentials after denial; stock forbidden to owner',stockHistory:'staff stock history and denied/empty/mismatched responses verified at both widths'});
    report.checks.push({role:owner?'owner':'admin',width,criterion:4,publishedBuild:origin.startsWith('https:'),terminal:'one print action, text-only green notice, no Check status',dialogs:'wifi/admin-code pending to applied: Check status removed, dates retained; admin SSID already applied: no Check status',pending:'two Check status controls retained',layout:'no overflow, no QR beside credentials'});
    await ctx.close();
  }
  assert.deepEqual(report.errors,[]);
  await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
