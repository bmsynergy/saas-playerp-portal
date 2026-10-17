// Read-only browser on real DEV. No mocked responses. Every business write is blocked.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
const out=process.env.LIVE_OUTPUT_DIR??'docs/evidence/pe474/live';await mkdir(out,{recursive:true});
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const report={origin,startedAt:new Date().toISOString(),realData:true,readOnly:true,views:[],network:[],blocked:[],errors:[]};
const readRpcs=new Set(['portal_access','is_platform_staff','portal_tenant_directory','portal_tenant_detail','portal_owner_venues','ps_firmware_page','ps_ota_channels_page','ps_ota_admin_overview','ps_ota_admin_deployments_page','ps_ota_admin_targets_page','ps_ota_admin_events_page','ps_ota_admin_audit_page','ps_admin_venue_search','ps_device_resolve','ps_device_sheet_resolve','ps_admin_device_detail','ps_admin_device_sheet','ps_admin_device_manage','ps_panel_devices','ps_panel_device','ps_panel_recovery_label','ps_panel_state','ps_panel_ota','ps_panel_printers','ps_panel_printer_jobs','ps_admin_legacy_credentials_context','ps_admin_device_models']);
let currentView='login';
async function setup(profile){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 await ctx.route('**/functions/v1/**',r=>{report.blocked.push({path:new URL(r.request().url()).pathname,method:r.request().method()});return r.abort();});
 await ctx.route('**/rest/v1/rpc/**',r=>{const name=new URL(r.request().url()).pathname.split('/').pop();if(!readRpcs.has(name)){report.blocked.push({rpc:name});return r.abort();}return r.continue();});
 const page=await ctx.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',async response=>{const req=response.request(),url=new URL(response.url());if(!url.pathname.startsWith('/rest/v1/rpc/'))return;const rpc=url.pathname.split('/').pop();let params={};try{params=req.postDataJSON()??{};}catch{}
 const entry={view:currentView,rpc,params,status:response.status()};report.network.push(entry);
 if(['ps_firmware_page','ps_ota_channels_page','ps_ota_admin_deployments_page','ps_ota_admin_targets_page','ps_ota_admin_events_page','ps_ota_admin_audit_page','ps_ota_admin_overview'].includes(rpc)){try{const body=await response.json();entry.total=body.total;entry.limit=body.limit;entry.offset=body.offset;entry.rows=(body.releases??body.rows??body.items??[]).length;entry.contract_version=body.contract_version;if(rpc==='ps_ota_admin_overview')entry.noMassiveArrays=!('devices'in body)&&!('releases'in body)&&body.groups.length<=100&&body.deployments.length<=10;}catch{}}
 });
 await page.goto(origin+'/auth/login?lang=en');await page.getByLabel('Email address',{exact:true}).fill(accounts[profile].email);await page.getByLabel('Password',{exact:true}).fill(accounts[profile].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(u=>!u.pathname.startsWith('/auth/'));
 return{ctx,page};
}
async function capture(page,name,width,lang,selector){await page.locator(selector).first().waitFor();await page.addStyleTag({content:'*{scroll-behavior:auto!important}'});await page.waitForTimeout(500);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${name} overflow ${width} ${lang}`);await page.screenshot({path:`${out}/${name}-${lang}-${width}.png`,fullPage:true});if(name==='firmwares'||name==='updates'){const section=page.locator(name==='firmwares'?'[data-testid^="fw-detail-"]':'[data-testid="ota-deploy-form"]').first();await section.scrollIntoViewIfNeeded();await page.waitForTimeout(300);await section.screenshot({path:`${out}/${name}-detail-${lang}-${width}.png`});}report.views.push({name,width,lang,path:new URL(page.url()).pathname,overflow:false});}
try{
 const {ctx,page}=await setup('staff_activo');
 for(const width of [1440,390])for(const lang of ['es','en']){
  await page.setViewportSize({width,height:1000});
  currentView=`firmwares-${lang}-${width}`;await page.goto(`${origin}/admin/print-servers/firmwares?lang=${lang}`);await expect(page.locator('[data-testid^="fw-row-"]').first()).toBeVisible();
  assert.equal(await page.getByText('Lifecycle information is unavailable',{exact:false}).count(),0);
  const row=page.locator('[data-testid^="fw-row-"]').filter({has:page.getByRole('button',{name:'0.3.24',exact:true})});await expect(row).toHaveAttribute('data-status','signed');await row.getByRole('button',{name:'0.3.24',exact:true}).click();
  await expect(page.locator('[data-testid^="fw-no-rings-"]')).toBeVisible();await expect(page.locator('[data-testid^="fw-promote-"][data-testid$="-lab"]')).toBeVisible();
  await capture(page,'firmwares',width,lang,'[data-testid^="fw-detail-"]');
  currentView=`channels-${lang}-${width}`;await page.goto(`${origin}/admin/print-servers/channels?lang=${lang}`);await capture(page,'channels',width,lang,'[data-testid^="channel-row-"]');
  if(width===1440&&lang==='es'){
   await page.getByTestId('channels-pagination-size').selectOption('10');await page.getByTestId('channels-pagination-next').click();await expect(page.getByTestId('channels-pagination-range')).toContainText('11');
   await page.getByTestId('channels-search').fill('78d05113');await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(1);
   await page.getByTestId('channels-ring').selectOption('lab');await expect(page.locator('[data-testid^="channel-row-"]')).toHaveCount(1);
  }
  currentView=`updates-${lang}-${width}`;await page.goto(`${origin}/admin/print-servers/updates?lang=${lang}`);await capture(page,'updates',width,lang,'[data-testid^="ota-deployment-"]');
  assert.equal(await page.getByRole('button',{name:lang==='es'?'Validar en Canary':'Validate in Canary',exact:true}).count(),0);
  if(width===1440&&lang==='es'){
   await page.getByTestId('deployments-pagination-next').click();await expect(page.getByTestId('deployments-pagination-range')).toContainText('26');
   const deployment=page.locator('details.ota-deployment').first();if(await deployment.getAttribute('open')===null)await deployment.locator('summary').click();
   const events=deployment.locator('[data-testid^="ota-events-toggle-"]').first();await events.waitFor();await events.click();await page.waitForResponse(r=>r.url().includes('/rpc/ps_ota_admin_events_page'));await page.getByTestId('ota-audit-search').click();await page.waitForResponse(r=>r.url().includes('/rpc/ps_ota_admin_audit_page'));
  }
  currentView=`device-${lang}-${width}`;await page.goto(`${origin}/admin/print-servers/devices/59a41440-8536-4045-aed1-3fcc5adaf193?lang=${lang}`);
  await page.getByTestId('admin-device-summary').waitFor();await expect(page.getByTestId('admin-device-summary')).toContainText('0.3.24');await expect(page.getByTestId('admin-device-update')).toBeDisabled();
  // Only the firmware section is captured: credentials remain concealed and are not included in evidence.
  const summary=page.getByTestId('admin-device-summary');await page.addStyleTag({content:'*{scroll-behavior:auto!important}'});await summary.scrollIntoViewIfNeeded();await page.waitForTimeout(700);await summary.screenshot({path:`${out}/device-${lang}-${width}.png`});
  assert.equal(await page.getByRole('button',{name:lang==='es'?'Validar en Canary':'Validate in Canary',exact:true}).count(),0);
  report.views.push({name:'device',width,lang,version:'0.3.23',newerNotEnabled:'0.3.24',updateDisabled:true});
 }
 await ctx.close();
 const owner=await setup('owner_varios');
 await owner.page.goto(`${origin}/?lang=en`);const tile=owner.page.locator('[data-testid^="owner-venue-tile-"]').first();await tile.waitFor();const venueId=(await tile.getAttribute('data-testid')).replace('owner-venue-tile-','');
 await owner.page.goto(`${origin}/?venue=${venueId}&section=print-servers&lang=en`);const deviceLink=owner.page.locator('[data-testid^="venue-ps-open-"]').first();await deviceLink.waitFor();const deviceHref=await deviceLink.getAttribute('href');
 for(const width of [1440,390])for(const lang of ['es','en']){currentView=`owner-${lang}-${width}`;await owner.page.setViewportSize({width,height:1000});await owner.page.goto(`${origin}${deviceHref}&lang=${lang}`);const ota=owner.page.getByTestId('ps-ota-block');await ota.waitFor();await expect(ota).not.toContainText('Cargando');await owner.page.waitForTimeout(700);const txt=await ota.innerText();for(const forbidden of ['Validar en Canary','Validate in Canary','Cambiar canal','Change channel','Requisitos para General'])assert.ok(!txt.includes(forbidden));assert.ok(!/[a-f0-9]{64}/i.test(txt));assert.ok(!/canary|canario|laboratorio|\back\b/i.test(txt),'Owner exposes internal ring policy');await owner.page.addStyleTag({content:'*{scroll-behavior:auto!important}'});await ota.scrollIntoViewIfNeeded();await owner.page.waitForTimeout(600);await ota.screenshot({path:`${out}/owner-${lang}-${width}.png`});report.views.push({name:'owner',width,lang,noInternalControls:true,noLongHashes:true});}

 await owner.ctx.close();
 assert.equal(report.blocked.length,0,'Unexpected write/read attempted');assert.equal(report.errors.length,0,'Browser error');
 const paged=report.network.filter(n=>n.rpc.endsWith('_page'));assert.ok(paged.some(n=>n.rpc==='ps_ota_channels_page'&&n.params.p_offset===10));assert.ok(paged.some(n=>n.rpc==='ps_ota_admin_deployments_page'&&n.params.p_offset===25));assert.ok(paged.every(n=>n.params.p_limit<=100&&(!n.rows||n.rows<=n.limit)));
 assert.ok(!report.network.some(n=>['ps_firmware_list','portal_ps_devices','ps_ota_target_events','portal_ps_inventory'].includes(n.rpc)));
 report.pass=true;
}catch(e){report.pass=false;report.failure=e.message;console.error(e.message);process.exitCode=1;}finally{report.finishedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({pass:report.pass,views:report.views.length,requests:report.network.length,blocked:report.blocked,failure:report.failure}));}
