// Acceptance against the real portal UI with isolated DEV API contracts.
// All external requests are intercepted; no real devices are changed.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799', 'https://playerp.dev.bmore.app'].includes(origin));
const out = process.env.SMOKE_OUTPUT_DIR ?? 'test-results/pe447';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const uid = '11111111-1111-4111-8111-111111111111', venueId = '22222222-2222-4222-8222-222222222222', date = '2026-10-14T04:00:00Z';
const user = { id: uid, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {} };
const exp = Math.floor(Date.now()/1000)+3600, enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = { access_token: `${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.synthetic`, refresh_token: 'synthetic', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
const device = (id, status, extra={}) => ({ id, serial: `PS-${id.toUpperCase()}`, hostname: `playerp-${id}`, model: 'rpi4-2gb', model_label: 'Raspberry Pi 4', arch: 'arm64', status, legacy: false, label: id, venue_id: status==='assigned'?venueId:null, venue_name: status==='assigned'?'Fixture Park':null, print_server_id: status==='assigned'?`ps-${id}`:null, software_version:'0.3.3', created_at:date, ...extra });
const server = (id,state) => ({print_server_id:`ps-${id}`, inventory_device_id:id, serial:`PS-${id.toUpperCase()}`, hostname:`playerp-${id}`, label:id, firmware_version:state==='pending'?null:'0.3.3', state, attention:state==='offline', error_count:state==='offline'?1:0, warning_count:0, last_seen_at:date});
const overview = () => ({contract_version:1,generated_at:date,online_window_seconds:180,summary:{venues:2,print_servers:3,unassigned:4,in_stock:2,retired:2},venues:[
 {venue_id:venueId,venue_name:'Fixture Park',venue_slug:'fixture-park',venue_is_active:true,location_short:'Ponce, PR',print_server_count:2,states:{online:1,offline:1,unknown:0,pending:0,attention:1},print_servers:[server('assigned','online'),server('offline','offline')]},
 {venue_id:'venue-pending',venue_name:'Pending Cafe',venue_slug:'pending-cafe',venue_is_active:true,location_short:null,print_server_count:1,states:{online:0,offline:0,unknown:0,pending:1,attention:0},print_servers:[server('pending','pending')]}
],unassigned:{count:4,in_stock:2,retired:2,devices:['stock','pending','retired','blocked'].map(id=>({inventory_device_id:id,serial:`PS-${id.toUpperCase()}`,hostname:`playerp-${id}`,label:id,model:'rpi4-2gb',status:['retired','blocked'].includes(id)?'retired':'stock',last_venue_name:null,pending_venue_name:id==='pending'?'Pending Cafe':null,created_at:date}))}});
const report = { origin, method: 'Real UI with intercepted synthetic DEV contracts; no live mutations or live authentication claims', checks: [], errors: [] };
async function setup(width) {
 const ctx = await browser.newContext({viewport:{width,height:1000},locale:'en-US'});
 await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','en');},session);
 const db = {devices:[device('assigned','assigned'),device('stock','stock'),device('retired','retired'),device('blocked','retired')],calls:[],lateBlock:false,overview:overview(),readMode:'ready'};
 await ctx.route(url=>!url.href.startsWith(origin), async route=>{
  const url = new URL(route.request().url()), name = url.pathname.split('/').pop();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co') return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/')) return send(name==='user'?user:session);
  if(name==='staff_profiles') return send(null);
  const args=route.request().postDataJSON()??{}; db.calls.push({name,args});
  if(name==='portal_access') return send({is_platform_staff:true,platform_role:'super_admin',owner_venues:[]});
  if(name==='is_platform_staff') return send(true);
  if(name==='portal_tenant_directory') return send([{id:venueId,name:'Fixture Park',slug:'fixture-park',is_active:true,city:'Ponce',state:'PR',created_at:date}]);
  if(name==='portal_ps_venue_overview') return db.readMode==='denied'?send({code:'42501'},403):db.readMode==='error'?send({code:'XX000'},500):send(db.overview);
  if(name==='portal_ps_devices') return send({ok:true,devices:db.devices});
  if(name==='portal_ps_inventory') return send({contract_version:1,generated_at:date,online_window_seconds:180,items:db.devices.map(d=>({id:d.id,device_id:d.id,label:d.label,hostname:d.hostname,serial:d.serial,assignment:d.venue_id?'assigned':'unassigned',venue_id:d.venue_id,venue_name:d.venue_name,last_venue_name:null,connection:d.venue_id?'online':'unassigned',last_seen_at:date,last_report_at:date,firmware_version:d.software_version,firmware_known:true,error_count:0,warning_count:0,printers_total:0,pending_jobs:0,last_issue_at:null,issues:[]}))});
  if(name==='ps_firmware_list') return send({releases:[],installed:[]});
  if(name==='platform-staff-admin') return send({members:[]});
  if(name==='ps_ota_admin_overview') return send({ok:true,keys:[],releases:[],groups:[],devices:[],deployments:[],audit_included:false});
  if(/^ps_ota_admin_(deployments|targets|audit|events)_page$/.test(name)) return send({ok:true,total:0,items:[],aggregates:{}});
  if(name==='ps_admin_device_models') return send({ok:true,default:{model:'rpi4-2gb',label:'Raspberry Pi 4',arch:'arm64'},models:[{model:'rpi4-2gb',label:'Raspberry Pi 4',archs:['arm64'],default_arch:'arm64',active:true,is_default:true}]});
  if(name==='ps_admin_venue_search') return send({ok:true,venues:[{id:venueId,name:'Fixture Park',slug:'fixture-park',city:'Ponce',state:'PR',is_active:true,assigned_device:null}]});
  if(name==='ps_admin_device_manage') {
   const d=db.devices.find(d=>d.id===args.p_device_id), blockers=[...(d.status!=='retired'?['device_not_retired']:[]),...(d.venue_id?['device_assigned']:[]),...(d.id==='blocked'||db.lateBlock?['active_operation']:[])];
   return send({ok:true,device:d,update:{current_version:d.software_version,latest_stable:null,update_available:false,active_update:null},delete:{allowed:!blockers.length,blockers},actions:{assign:{allowed:d.status==='stock'},move:{allowed:!!d.venue_id},unassign:{allowed:!!d.venue_id},retire:{allowed:d.status!=='retired',confirm_with:'serial',revoke_reason:'retired'},delete:{allowed:!blockers.length,confirm_with:'serial'}}});
  }
  if(name==='ps_admin_device_revoke') {assert.equal(args.p_reason,'retired');const d=db.devices.find(d=>d.id===args.p_device_id);assert.equal(d.id,'stock');d.status='retired';return send({ok:true});}
  if(name==='ps_admin_device_delete') {assert.equal(args.p_confirm_serial,`PS-${args.p_device_id.toUpperCase()}`);if(db.lateBlock) return send({ok:false,error:'delete_blocked',blockers:['active_operation'],messages:['An operation is pending'],next_step:null});assert.equal(db.devices.find(d=>d.id===args.p_device_id).status,'retired');db.devices=db.devices.filter(d=>d.id!==args.p_device_id);return send({ok:true});}
  report.errors.push(`Unexpected endpoint ${name}`); return route.abort();
 });
 const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',err=>report.errors.push(err.message));return {ctx,page,db};
}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');}
async function heights(page,label){
 const sizes=await page.locator('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),select').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const wrap=n.closest('.search-field,.print-dashboard-search,.venue-combobox-control,.field-control');return {id:n.dataset.testid||n.id||n.type,height:(wrap||n).getBoundingClientRect().height};}));
 assert(sizes.length>0,label);for(const size of sizes)assert.equal(size.height,44,`${label} ${size.id} is ${size.height}px`);return sizes.length;
}
async function clearPattern(page,button){await expect(button).toHaveClass(/clear-filters-button/);await expect(button.locator('svg')).toHaveCount(1);assert.equal(await button.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');}
try {
 for(const width of [390,1440]) {
  const {ctx,page,db}=await setup(width);let measured=0;
  await page.goto(origin+'/admin/print-servers/list');await expect(page.getByTestId('ps-list-page')).toBeVisible();await expect(page.locator('.ps-venue-card')).toHaveCount(3);
  const park=page.getByTestId('ps-venue-'+venueId);await expect(park).toContainText('Ponce, PR');await expect(park).toContainText('2 Print Servers');await expect(park).toContainText('1 need attention');
  await park.locator('summary').focus();await page.keyboard.press('Enter');await expect(park).toHaveAttribute('open','');
  await expect(park.locator('tbody tr')).toHaveCount(2);for(const text of ['playerp-assigned','PS-ASSIGNED','0.3.3','Online','Offline'])await expect(park).toContainText(text);
  await expect(page.getByTestId('ps-list-open-ps-assigned')).toHaveAttribute('href','/admin/print-servers/devices/ps-assigned');
  await expect(page.getByTestId('ps-unassigned-inventory')).toHaveAttribute('href','/admin/print-servers/inventory');await expect(page.getByTestId('ps-unassigned-card')).toContainText('Retired');await expect(page.getByTestId('ps-unassigned-card')).toContainText('counted once in Inventory');
  measured+=await heights(page,'list');await noOverflow(page);await page.screenshot({path:`${out}/venues-${width}.png`,fullPage:true});
  const clear=page.getByTestId('ps-list-clear');await expect(clear).toBeDisabled();await clearPattern(page,clear);
  await page.getByTestId('ps-list-search').fill('offline');await expect(page.locator('.ps-venue-card')).toHaveCount(1);await expect(park.locator('tbody tr')).toHaveCount(1);await clear.click();await expect(clear).toBeDisabled();
  await page.getByTestId('ps-list-connection').selectOption('pending');await expect(page.getByTestId('ps-venue-venue-pending')).toBeVisible();await expect(park).toHaveCount(0);await clear.click();
  await page.getByTestId('ps-list-search').fill('not-present');await expect(page.getByTestId('ps-list-empty')).toBeVisible();await clear.click();
  await page.getByRole('button',{name:'ES',exact:true}).click();await expect(clear).toHaveText('Limpiar filtros');await expect(page.getByTestId('ps-unassigned-card')).toContainText('Retirados');await page.getByRole('button',{name:'EN',exact:true}).click();
  await page.getByTestId('ps-unassigned-inventory').click();await expect(page.getByTestId('devices-page')).toBeVisible();measured+=await heights(page,'inventory');await noOverflow(page);
  const invClear=page.locator('.admin-list-clear');await clearPattern(page,invClear);await expect(invClear).toBeDisabled();
  await page.getByTestId('devices-search').fill('stock');await page.getByTestId('devices-from').fill('2026-10-14');await page.getByTestId('devices-assignment').selectOption('unassigned');await page.getByTestId('devices-version').selectOption('0.3.3');await invClear.click();await expect(invClear).toBeDisabled();for(const id of ['devices-search','devices-from','devices-assignment','devices-version'])await expect(page.getByTestId(id)).toHaveValue('');
  await page.getByTestId('inv-create').click();let dialog=page.getByTestId('admin-device-add-dialog');await expect(page.getByTestId('inv-add-venue')).toBeVisible();measured+=await heights(page,'create/combobox');await noOverflow(page);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  for(const id of ['assigned','blocked']) {await page.getByTestId('inv-manage-PS-'+id.toUpperCase()).click();dialog=page.getByTestId('admin-device-manage-dialog');await expect(page.getByTestId('inv-delete-blockers')).toBeVisible();await expect(page.getByTestId('inv-manage-delete')).toHaveCount(0);await expect(dialog).toContainText(id==='assigned'?'Unassign it first':'operation');await page.keyboard.press('Escape');}
  await page.getByTestId('inv-manage-PS-STOCK').click();await expect(page.getByTestId('inv-manage-retire')).toBeVisible();await expect(page.getByTestId('inv-manage-delete')).toHaveCount(0);await page.getByTestId('inv-manage-retire').click();await expect(page.getByTestId('inv-manage-confirm')).toBeDisabled();await page.getByTestId('inv-confirm-serial').fill('PS-STOCK');await page.getByTestId('inv-manage-confirm').click();await expect(page.getByTestId('inv-row-PS-STOCK')).toHaveAttribute('data-status','retired');assert(db.devices.some(d=>d.id==='stock'),'Retire preserves inventory record');
  await page.getByTestId('inv-manage-PS-RETIRED').click();await page.getByTestId('inv-manage-delete').click();dialog=page.getByTestId('admin-device-manage-dialog');await expect(dialog).toHaveAttribute('role','alertdialog');await expect(page.getByTestId('inv-manage-confirm')).toBeDisabled();await page.getByTestId('inv-confirm-serial').fill('wrong');await expect(page.getByTestId('inv-manage-confirm')).toBeDisabled();assert.equal(db.calls.filter(c=>c.name==='ps_admin_device_delete').length,0);await page.getByTestId('inv-confirm-serial').fill('PS-RETIRED');await expect(page.getByTestId('inv-manage-confirm')).toBeEnabled();await dialog.screenshot({path:`${out}/delete-confirm-${width}.png`});await page.getByTestId('inv-manage-confirm').click();await expect(page.getByTestId('inv-row-PS-RETIRED')).toHaveCount(0);
  await page.getByTestId('inv-manage-PS-STOCK').click();await page.getByTestId('inv-manage-delete').click();await page.getByTestId('inv-confirm-serial').fill('PS-STOCK');db.lateBlock=true;await page.getByTestId('inv-manage-confirm').click();await expect(page.getByTestId('inv-delete-blockers')).toBeVisible();await expect(page.getByTestId('inv-manage-delete')).toHaveCount(0);await expect(page.getByTestId('inv-row-PS-STOCK')).toHaveCount(1);await expect(page.getByTestId('admin-device-manage-dialog').getByRole('alert')).toContainText('operation');await page.keyboard.press('Escape');
  for(const [path,search,clearId] of [['/admin/print-servers','inventory-filter-search','dashboard-filter-clear'],['/admin/tenants','tenants-search',null],['/admin/staff','staff-search',null],['/admin/print-servers/firmwares','fw-releases-search',null]]) {
   await page.goto(origin+path);await expect(page.getByTestId(search)).toBeVisible();measured+=await heights(page,path);const btn=clearId?page.getByTestId(clearId):page.locator('.clear-filters-button').first();await clearPattern(page,btn);await expect(btn).toBeDisabled();await page.getByTestId(search).fill('fixture');await expect(btn).toBeEnabled();await btn.click();await expect(btn).toBeDisabled();await expect(page.getByTestId(search)).toHaveValue('');await noOverflow(page);
  }
  report.checks.push({width,venues:'2 venues + separate stock/retired card, keyboard expansion, device details, canonical links, filters, EN/ES',controlsMeasured:measured,controlHeight:44,clearFilters:'shared light icon/text, disabled with no filters, full resets including dates/version/assignment',delete:'assigned/stock/blocked absent; Retire preserves record; exact serial required; eligible Retired removed; late refusal preserves record and closes delete gate',noOverflow:true});
  await ctx.close();
 }
 assert.deepEqual(report.errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
