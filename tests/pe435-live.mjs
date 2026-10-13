// Existing DEV staff account, read-only acceptance on the published portal. Never mutates devices.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert.ok(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const out=process.env.LIVE_OUTPUT_DIR??'test-results/pe435-live';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const report={origin,kind:'Real DEV browser and backend; existing authorized staff account; read-only',checks:[],errors:[],mutations:[]};
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
 page.on('request',r=>{const name=new URL(r.url()).pathname.split('/').pop();if(['ps_admin_device_create','ps_admin_device_assign','ps_admin_device_move','ps_admin_device_revoke','ps_admin_device_delete'].includes(name))report.mutations.push(name);});
 await page.goto(origin+'/auth/login?lang=en');await page.getByLabel('Email address',{exact:true}).fill(accounts.staff_activo.email);await page.getByLabel('Password',{exact:true}).fill(accounts.staff_activo.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/auth/'));
 await page.goto(origin+'/admin/print-servers/inventory');await expect(page.getByTestId('devices-page')).toBeVisible();
 for(const width of [390,834,1440]){
  await page.setViewportSize({width,height:1000});
  const controls=await page.getByTestId('devices-filters').locator('input,select,button').evaluateAll(els=>els.map(e=>({id:e.dataset.testid??e.textContent.trim(),height:e.getBoundingClientRect().height})));
  assert.deepEqual(controls.map(c=>c.id),['devices-search','devices-status','devices-assignment','devices-version','devices-from','devices-to','Clear filters']);assert.ok(controls.every(c=>Math.abs(c.height-44)<1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${out}/inventory-${width}.png`,fullPage:true});
  const catalogResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_admin_device_models'));await page.getByTestId('inv-create').click();const catalog=await(await catalogResponse).json();assert.equal(catalog.ok,true);assert.ok(catalog.default);
  let dialog=page.getByTestId('admin-device-add-dialog');await expect(dialog.locator('select').nth(0)).toHaveValue(catalog.default.model);await expect(dialog.locator('select').nth(1)).toHaveValue(catalog.default.arch);
  assert.equal((await page.getByTestId('inv-create').innerText()).trim(),'Add Print Server');assert.ok(await dialog.locator('select,input:not([role=combobox]),.venue-combobox-control').evaluateAll(els=>els.every(e=>Math.abs(e.getBoundingClientRect().height-44)<1)),'uniform Add controls');
  const venuesResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_admin_venue_search'));await page.getByTestId('inv-add-venue').click();const venues=await(await venuesResponse).json();assert.equal(venues.ok,true);assert.ok(venues.venues.length);
  await expect(dialog.getByRole('option',{name:'Not assigned',exact:true})).toBeVisible();
  const needle=venues.venues[0].name;
  const searchResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_admin_venue_search')&&r.request().postDataJSON()?.p_query===needle);await page.getByTestId('inv-add-venue').fill(needle);assert.equal((await(await searchResponse).json()).ok,true);
  await expect(dialog.getByRole('option').filter({hasText:needle}).first()).toBeVisible();await dialog.screenshot({path:`${out}/add-search-${width}.png`});await page.getByTestId('inv-add-venue').press('Escape');await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  const assigned=page.locator('[data-testid^="inv-row-"][data-status="assigned"]').first();await expect(assigned).toBeVisible();assert.deepEqual(await assigned.getByRole('button').allTextContents(),['Open device sheet','Manage']);
  await assigned.getByRole('button',{name:'Open device sheet',exact:true}).click();await expect(page.getByTestId('admin-device-summary')).toBeVisible();await page.keyboard.press('Escape');
  const manageResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_admin_device_manage'));await assigned.getByRole('button',{name:'Manage',exact:true}).click();const managed=await(await manageResponse).json();assert.equal(managed.ok,true);assert.equal(managed.actions.delete.allowed,false);
  dialog=page.getByTestId('admin-device-manage-dialog');await expect(dialog.getByRole('button',{name:/Delete/})).toHaveCount(0);await expect(dialog.getByTestId('inv-manage-assign')).toBeDisabled();await dialog.screenshot({path:`${out}/manage-${width}.png`});
  if(managed.actions.unassign.allowed){await dialog.getByRole('button',{name:'Unassign',exact:true}).click();await expect(dialog).toHaveAttribute('role','alertdialog');await dialog.getByRole('button',{name:'Back',exact:true}).click();}
  await page.keyboard.press('Escape');
  report.checks.push({width,filterOrderAnd44px:true,noOverflow:true,defaultFromBackend:catalog.default.model+'/'+catalog.default.arch,venueSearch:true,cleanActions:true,assignedDeleteAbsent:true,unassignConfirmationCancelled:true});
 }
 await page.goto(origin+'/admin/print-servers/updates');await expect(page.getByTestId('updates-page')).toBeVisible();const dep=page.locator('.ota-deployment').first();await expect(dep).toBeVisible();
 if(await dep.getAttribute('open')===null)await dep.locator('summary').first().click();
 await expect(dep.locator('.admin-list-filters,input[type="search"],input[type="date"]')).toHaveCount(0);await expect(dep.locator('.ota-table')).toBeVisible();await dep.screenshot({path:`${out}/deployment.png`});
 const eventButton=dep.locator('[data-testid^="ota-events-toggle-"]').first();let eventsOpened=false;
 if(await eventButton.count()){await eventButton.click();await expect(dep.locator('.ota-events-row')).toBeVisible();eventsOpened=true;}
 report.checks.push({deploymentDirectTargets:true,noInternalFilters:true,eventsOpened});assert.deepEqual(report.errors,[]);assert.deepEqual(report.mutations,[]);
 await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 const config=await readFile('src/lib/config.ts','utf8'),key=config.match(/SUPABASE_PUBLIC_KEY = "([^"]+)"/)[1];
 await page.evaluate(async key=>{const session=JSON.parse(localStorage.getItem('playerp.portal.dev.auth')||'null');if(session)await fetch('https://fzwzmwstxlsxdzdmphyq.supabase.co/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`}});},key);
}finally{await browser.close();}
