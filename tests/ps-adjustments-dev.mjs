// DEV-only acceptance. Writes restricted to two existing isolated PE462 fixture devices.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { login, rpc } from './ps-adjustments-session.mjs';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out=process.env.LIVE_OUTPUT_DIR??'../evidence/acceptance';await mkdir(out,{recursive:true});
const venue='f4430000-0000-4000-8000-0000000000f1', staging='f4570000-0000-4000-8000-0000000000e1';
const staff=await login('staff_activo'), owner=await login('owner_varios');
const inv=await rpc(staff,'portal_ps_devices');
const a=inv.devices.find(d=>d.serial==='PS-PE462ASG'), b=inv.devices.find(d=>d.serial==='PS-PE462NVP');
assert(a&&b);assert.equal(a.link.prepared,true);assert.equal(b.link.prepared,false);
const allowed=new Set([a.id,b.id]);
const report={origin,started:new Date().toISOString(),criteria:{1:[],2:[],3:[],4:[]},mutations:[],blocked:[],screenshots:[]};
async function write(name,args){assert(allowed.has(args.p_device_id));assert(['ps_admin_device_move','ps_admin_device_assign','ps_device_set_label'].includes(name));const r=await rpc(staff,name,args);assert.equal(r.ok,true);report.mutations.push({name,device:args.p_device_id});return r;}
const link=async id=>(await rpc(staff,'ps_device_link_status',{p_device_id:id})).link;
const identity=async()=>{const d=await rpc(staff,'ps_admin_device_sheet',{p_device_id:a.id});return {serial:d.device.serial,hostname:d.device.hostname,wifi:d.credentials?.wifi,cert:d.cert};};
const beforeIdentity=await identity();
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const contexts=[];
async function page(s){const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-ES'});contexts.push(ctx);await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},s);
 await ctx.route('**/rest/v1/rpc/**',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(/(assign|move|prepare|set_label|create|revoke|delete|rotate|update|enrollment)/.test(name)&&!['ps_admin_device_manage','ps_admin_venue_search','ps_panel_updates'].includes(name)){const args=route.request().postDataJSON();if(!['ps_admin_device_assign','ps_admin_device_move','ps_device_set_label'].includes(name)||!allowed.has(args.p_device_id)){report.blocked.push(name);return route.abort();}report.mutations.push({name,device:args.p_device_id});}return route.continue();});
 await ctx.route('**/functions/v1/ps-ota-admin',route=>{report.blocked.push('OTA');return route.abort();});const p=await ctx.newPage();p.setDefaultTimeout(20000);return p;}
async function shot(p,name){if(name.startsWith('c2-modal'))await p.getByTestId('admin-device-manage-dialog').screenshot({path:`${out}/${name}.png`});else{await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:`${out}/${name}.png`,fullPage:!name.startsWith('c2-update')});}report.screenshots.push(name);}
async function goto(p,path){await p.goto(origin+path);await p.waitForLoadState('networkidle');}
async function noOverflow(p){assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');}
const adminVenue=`/admin/tenants/${venue}/print-servers`, ownerVenue=`/?venue=${venue}&section=print-servers`;
const sheet=`/admin/print-servers/devices/${a.id}`;
try{
 const p=await page(staff);
 // Name editing success, validation and a refused write, then a successful retry.
 await goto(p,sheet);const input=p.getByTestId('ps-link-name'), save=p.getByTestId('ps-link-name-save');await expect(input).toBeVisible();
 const saved='PE462 fixture · nombre comprobado';await input.fill(saved);if(await save.isEnabled()){await save.click();await expect(p.getByTestId('ps-link-name-result')).toContainText('guardado');}
 await p.reload();await expect(input).toHaveValue(saved);
 await input.fill('<no válido>');await expect(save).toBeDisabled();await expect(p.locator('.ps-link-name [role="alert"]')).toBeVisible();await shot(p,'c1-nombre-invalido');
 await input.fill('PE462 fixture · reintento');
 await p.route('**/rpc/ps_device_set_label',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:false,error:'invalid_label',message:'Fallo controlado: nombre no guardado.'})}),{times:1});
 await save.click();await expect(p.getByTestId('ps-link-name-result')).toContainText('Fallo controlado');assert.equal((await link(a.id)).label,saved);await shot(p,'c1-nombre-error');
 await save.click();await expect(p.getByTestId('ps-link-name-result')).toContainText('guardado');await p.reload();await expect(input).toHaveValue('PE462 fixture · reintento');
 // A failed reread must preserve the mounted editor and distinguish a saved write from refresh failure.
 await input.fill('PE462 fixture · refresco pendiente');
 await p.route('**/rpc/ps_device_sheet_resolve',route=>route.abort('failed'),{times:1});
 await save.click();await expect(input).toBeVisible();await expect(p.getByTestId('ps-link-name-result')).toContainText('guardado');
 await expect(p.getByRole('button',{name:'Reintentar',exact:true})).toBeVisible();
 assert.equal((await link(a.id)).label,'PE462 fixture · refresco pendiente');await shot(p,'c1-refresco-error');
 await p.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(input).toHaveValue('PE462 fixture · refresco pendiente');
 assert.deepEqual(await identity(),beforeIdentity);report.criteria[1].push('Admin: guardado real, refresh, entrada inválida deshabilitada, rechazo controlado sin cambio y reintento; identidad técnica intacta.');
 // Prepared fixture: move to isolated staging, then confirm back through UI.
 await write('ps_admin_device_move',{p_device_id:a.id,p_venue_id:staging});
 await goto(p,'/admin/print-servers/inventory');await p.getByTestId('devices-search').fill(a.serial);
 const row=p.locator('tr',{hasText:a.serial});await row.getByRole('button',{name:/Asignación|Manage/}).click();
 const dialog=p.getByTestId('admin-device-manage-dialog');await expect(dialog).toBeVisible();
 await p.getByTestId('inv-manage-venue').fill('PE443 fixture');await p.getByRole('option',{name:/PE443 fixture/}).click();await p.getByTestId('inv-manage-assign').click();await shot(p,'c4-asignacion-confirmar');
 await p.route('**/rpc/ps_admin_device_move',route=>route.abort('failed'),{times:1});await p.getByTestId('inv-confirm-assign').click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(p.getByTestId('inv-assigned')).toHaveCount(0);assert.equal((await link(a.id)).venue_id,staging);
 // Lost response after a successful server write: retry must remain idempotent.
 let firstSaved;
 await p.route('**/rpc/ps_admin_device_move',async route=>{const r=await route.fetch();const body=await r.json();assert.equal(body.ok,true);firstSaved=body.link;await route.abort('failed');},{times:1});
 await p.getByTestId('inv-confirm-assign').click();await expect(dialog.getByRole('alert')).toBeVisible();assert.equal((await link(a.id)).venue_id,venue);await expect(p.getByTestId('inv-assigned')).toHaveCount(0);
 await p.getByTestId('inv-confirm-assign').click();await expect(p.getByTestId('inv-assigned')).toBeVisible();assert.equal((await link(a.id)).rev,firstSaved.rev);await expect(p.getByTestId('ps-preparation-code')).toHaveCount(0);await shot(p,'c4-asignacion-reintento');await p.getByTestId('inv-assigned-close').click();
 report.criteria[4].push('Preparado: venue + confirmación sin código; fallo de red antes de guardar y respuesta perdida después de guardar; reintento conserva revisión sin duplicar vínculo.');
 // Assign the unprepared second fixture; the first unit must remain unchanged.
 const first=await link(a.id);const beforeDevices=(await rpc(staff,'ps_panel_devices',{p_venue_id:venue})).devices.map(d=>d.id);
 await p.getByTestId('devices-search').fill(b.serial);await p.locator('tr',{hasText:b.serial}).getByRole('button',{name:/Asignación|Manage/}).click();await expect(dialog).toBeVisible();
 if((await link(b.id)).venue_id!==venue){await p.getByTestId('inv-manage-venue').fill('PE443 fixture');await p.getByRole('option',{name:/PE443 fixture/}).click();await p.getByTestId('inv-manage-assign').click();await p.getByTestId('inv-confirm-assign').click();await expect(p.getByTestId('inv-assigned')).toBeVisible();}
 await expect(dialog).toContainText('Crear el inventario no configura la Raspberry');await expect(p.getByTestId('ps-preparation-code')).toHaveCount(0);await shot(p,'c4-onboarding-pendiente');await p.keyboard.press('Escape');
 assert.deepEqual(await link(a.id),first);const afterDevices=(await rpc(staff,'ps_panel_devices',{p_venue_id:venue})).devices.map(d=>d.id);assert(beforeDevices.every(id=>afterDevices.includes(id)));
 report.criteria[3].push('Segundo fixture no preparado asignado al venue aislado; todos los dispositivos previos conservados y vínculo del primero idéntico.');
 report.criteria[4].push('No preparado: asignación inmediata, preparación física pendiente explicada, ningún código emitido.');
 // Views + responsive layout, including update and dialogs, admin and owner.
 for(const width of [390,1440]){
  await p.setViewportSize({width,height:1000});
  await goto(p,adminVenue);await expect(p.getByText(a.serial,{exact:true})).toBeVisible();await expect(p.getByText(b.serial,{exact:true})).toBeVisible();await expect(p.getByTestId('venue-ps-add-label')).toHaveCount(0);await expect(p.locator('input')).toHaveCount(0);
  const button=p.getByTestId('venue-ps-add-submit'), head=p.locator('.venue-ps-heading');const br=await button.boundingBox(),hr=await head.boundingBox();assert(Math.abs(hr.x+hr.width-br.x-br.width)<3,'Add aligned right');const lead=await p.locator('.staff-panel-lead').first().boundingBox();assert(lead.y>=br.y+br.height+8,'button clearance');await noOverflow(p);await shot(p,`c2-venue-admin-${width}`);
  await p.reload();await expect(p.getByText(a.serial,{exact:true})).toBeVisible();await expect(p.getByText(b.serial,{exact:true})).toBeVisible();
  await goto(p,'/admin/print-servers/inventory');await p.getByTestId('devices-search').fill('PE462');await expect(p.getByText(a.serial,{exact:true})).toBeVisible();await expect(p.getByText(b.serial,{exact:true})).toBeVisible();await noOverflow(p);await shot(p,`c3-inventario-${width}`);
  await p.locator('tr',{hasText:a.serial}).getByRole('button',{name:/Asignación|Manage/}).click();await expect(dialog).toBeVisible();await expect(p.getByTestId('inv-manage-venue')).toBeVisible();await noOverflow(p);await shot(p,`c2-modal-${width}`);await p.keyboard.press('Escape');
  await goto(p,'/admin/print-servers/list');const card=p.getByTestId(`ps-venue-${venue}`);await card.locator('summary').click();await expect(card).toContainText(a.serial);await expect(card).toContainText(b.serial);await expect(card).toContainText('Asignado · pendiente de sincronización');await expect(card).toContainText('Pendiente');await noOverflow(p);await card.scrollIntoViewIfNeeded();await shot(p,`c3-global-${width}`);
  await goto(p,'/admin/print-servers/updates');await expect(p.getByTestId('updates-page')).toBeVisible();const deployment=p.locator('.ota-deployment').first();if(await deployment.count()&&await deployment.getAttribute('open')===null)await deployment.locator('summary').first().click();await noOverflow(p);await shot(p,`c2-update-${width}`);
 }
 const op=await page(owner);
 for(const width of [390,1440]){await op.setViewportSize({width,height:1000});await goto(op,ownerVenue);await expect(op.getByText(a.serial,{exact:true})).toBeVisible();await expect(op.getByText(b.serial,{exact:true})).toBeVisible();await expect(op.getByTestId('venue-ps-add-label')).toHaveCount(0);await expect(op.getByTestId('venue-ps-add-submit')).toHaveCount(0);await noOverflow(op);await shot(op,`c3-venue-owner-${width}`);const ar=op.locator('tr',{hasText:a.serial});await ar.locator('a').click();await expect(op.getByTestId('ps-link-name')).toBeVisible();await expect(op.getByTestId('ps-prepare')).toHaveCount(0);await noOverflow(op);await shot(op,`c1-ficha-owner-${width}`);}
 await op.getByTestId('ps-link-name').fill('PE462 fixture · nombre owner');await op.getByTestId('ps-link-name-save').click();await expect(op.getByTestId('ps-link-name-result')).toContainText('guardado');await op.reload();await expect(op.getByTestId('ps-link-name')).toHaveValue('PE462 fixture · nombre owner');assert.deepEqual(await identity(),beforeIdentity);
 report.criteria[1].push('Owner: editor autorizado guarda y persiste al refrescar; sin controles de asignación staff.');
 report.criteria[2].push('390/1440 px: Agregar alineado a derecha, separación al texto >=8 px, sin overflow; capturas de venue, inventario, modal, update y ficha owner.');
 report.criteria[3].push('Admin/owner 390/1440: ambos fixtures en venue, ficha canónica; inventario/global muestran serial/nombre/modelo/venue, pendiente de sincronización y telemetría pendiente; refresh conserva filas.');
 assert.equal(report.blocked.length,0);report.pass=true;
}catch(e){report.pass=false;report.error=String(e.stack??e);throw e;}
finally{await write('ps_device_set_label',{p_device_id:a.id,p_label:a.label??null});if((await link(a.id)).venue_id!==venue)await write('ps_admin_device_move',{p_device_id:a.id,p_venue_id:venue});report.finished=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({pass:report.pass,error:report.error,criteria:report.criteria}));}
