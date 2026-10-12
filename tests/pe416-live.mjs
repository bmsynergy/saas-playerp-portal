// Live DEV only: upload/delete our own disposable firmware via the UI, never deploy it.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert.ok(['https://playerp.dev.bmore.app','http://127.0.0.1:18799'].includes(origin));
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const zip=process.env.FW_ZIP;assert.ok(zip);
const out=process.env.LIVE_OUTPUT_DIR??'test-results/pe416-live';await mkdir(out,{recursive:true});
const report={origin,kind:'Real DEV session and backend, own disposable firmware only',checks:[],screenshots:[]};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
let ownId=null,deleted=false,page;
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});page=await ctx.newPage();page.setDefaultTimeout(30000);
 await page.goto(origin+'/auth/login?lang=en');await page.getByLabel('Email address',{exact:true}).fill(accounts.staff_activo.email);await page.getByLabel('Password',{exact:true}).fill(accounts.staff_activo.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/auth/'));
 const inventoryResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/portal_ps_inventory')&&r.status()===200);await page.goto(origin+'/admin/print-servers/firmwares');await expect(page.getByTestId('fw-form')).toBeVisible();
 const inventory=await (await inventoryResponse).json();const rows=page.getByTestId('fw-devices').locator(':scope > li');await expect(rows).toHaveCount(inventory.items.length);
 const heights=await page.locator('[data-testid="firmwares-page"] select,[data-testid="fw-version"],[data-testid="fw-revision"]').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));assert.ok(heights.every(v=>v===44));
 if(inventory.items.length){const item=inventory.items[0],version=item.firmware_known?item.firmware_version:null;const legend=page.getByTestId(`fw-legend-${version||'unknown'}`);await legend.click();await expect(rows).toHaveCount(inventory.items.filter(i=>(i.firmware_known?i.firmware_version:null)===version).length);await page.getByTestId('fw-clear-distribution').click();}
 report.checks.push({criterion:1,inventory:inventory.items.length,controls:heights,chartFilter:'matches live inventory'});
 await page.getByTestId('fw-distribution').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/distribution-real-1440.png`});report.screenshots.push('distribution-real-1440.png');
 await page.getByTestId('fw-file').setInputFiles(zip);await page.getByTestId('fw-version').fill('0.0.416');await page.getByTestId('fw-revision').fill(`frontend-${Date.now()}`);await page.getByTestId('fw-notes').fill('PE-416 disposable interface verification. Not a deployable firmware. This file will be deleted by this same test.');
 const finalized=page.waitForResponse(r=>r.url().endsWith('/functions/v1/ps-firmware-admin')&&r.request().postDataJSON()?.action==='finalize');await page.getByTestId('fw-submit').click();const f=await (await finalized).json();assert.equal(f.ok,true);ownId=f.release.id;
 const card=page.getByTestId(`fw-row-${ownId}`);await expect(card).toBeVisible();await expect(page.getByTestId('fw-result')).toHaveAttribute('data-ok','true');
 for(const width of [1440,834,390]){await page.setViewportSize({width,height:1000});await card.scrollIntoViewIfNeeded();assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth));const notes=await card.locator('.fw-release-notes').boundingBox(),facts=await card.locator('.fw-release-facts').boundingBox();assert.ok(notes.width>=facts.width-2);await page.screenshot({path:`${out}/firmware-real-${width}.png`});report.screenshots.push(`firmware-real-${width}.png`);}
 report.checks.push({criterion:2,card:'actual uploaded test firmware; multiline/full-width notes/no overflow at 1440,834,390'});
 const button=page.getByTestId(`fw-delete-${ownId}`);await button.click();await expect(page.getByTestId('fw-delete-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(card).toBeVisible();
 await button.click();const deletion=page.waitForResponse(r=>r.url().endsWith('/functions/v1/ps-firmware-admin')&&r.request().postDataJSON()?.action==='delete');await page.getByTestId('fw-confirm-delete').click();const response=await deletion,payload=await response.json();assert.equal(response.status(),200);assert.equal(payload.ok,true);assert.equal(payload.deleted.id,ownId);assert.equal(payload.file_removed,true);deleted=true;
 await expect(card).toHaveCount(0);await expect(page.getByTestId('fw-delete-notice')).toBeVisible();await page.screenshot({path:`${out}/delete-success-real-390.png`});report.screenshots.push('delete-success-real-390.png');await page.reload();await expect(page.getByTestId('fw-form')).toBeVisible();await expect(page.getByTestId(`fw-row-${ownId}`)).toHaveCount(0);
 report.checks.push({criterion:3,deleted_id:ownId,http:response.status(),file_removed:payload.file_removed,cancel:'no mutation',refresh:'absent after page reload'});
 await page.setViewportSize({width:1440,height:1000});const overviewResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_ota_admin_overview')&&r.status()===200);await page.goto(origin+'/admin/print-servers/updates');const overview=await (await overviewResponse).json();await expect(page.getByTestId('updates-page')).toBeVisible();
 const device=overview.devices.find(d=>d.target);if(device){const target=device.target;const eventsResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_ota_target_events')&&r.status()===200);await page.getByTestId(`ota-events-toggle-${target.id}`).click();const actual=await (await eventsResponse).json();assert.equal(actual.ok,true);if(actual.events.length)await expect(page.getByTestId(`ota-events-${target.id}`).locator(':scope > li')).toHaveCount(actual.events.length);await expect(page.getByTestId(`events-${target.id}-pagination`)).toHaveCount(0);report.checks.push({criterion:4,events:actual.events.length,target:target.id,pagination:false});await page.getByTestId(`ota-events-toggle-${target.id}`).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/events-real-1440.png`});report.screenshots.push('events-real-1440.png');}else report.checks.push({criterion:4,events:'No current target in DEV; complete list checked with 137-event synthetic fixture'});
 console.log(JSON.stringify(report,null,2));await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));
}finally{
 // If a later assertion fails, remove only this run's own fixture with its ordinary user session.
 if(ownId&&!deleted&&page){await page.evaluate(async id=>{const session=JSON.parse(localStorage.getItem('playerp.portal.dev.auth')||'null');if(!session?.access_token)return;await fetch('https://fzwzmwstxlsxdzdmphyq.supabase.co/functions/v1/ps-firmware-admin',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'delete',id})});},ownId).catch(()=>{});}
 await browser.close();
}
