import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {origin,realId,out,login,launch,context,guard,assertGuard} from './helpers/pe600-readonly.mjs';
const phase=process.env.PE600_PHASE??'before';
const report={phase,origin,views:[],contracts:{}};const browser=await launch();
try{const session=await login();for(const width of [1440,390]){
 const ctx=await context(browser,session,width);const protection={};await guard(ctx,protection);const page=await ctx.newPage();
 page.on('response',async res=>{const name=new URL(res.url()).pathname.split('/').at(-1);if(['ps_admin_device_detail','ps_device_resolve','portal_access','is_platform_staff'].includes(name)&&res.ok()){const d=await res.json();report.contracts[name]=name==='ps_admin_device_detail'?{update:d.update}:name==='ps_device_resolve'?{serial:d.serial,capabilities:d.capabilities,venue:d.venue,legacy:d.legacy}:d;}});
 await page.goto(origin+'/admin/print-servers/devices/'+realId);await expect(page.getByTestId('ps-device-sheet')).toBeVisible({timeout:30000});await expect(page.getByTestId('admin-device-summary')).toBeVisible({timeout:30000});await page.waitForTimeout(1500);
 if(phase==='after'){
  await expect(page.locator('.ps469-sections a')).toHaveText(['Resumen','Instalación y entrega','Red y acceso','Firmware','Impresoras','Diagnóstico']);
  await expect(page.getByTestId('ps-technical-details')).not.toHaveAttribute('open');
  await expect(page.getByTestId('admin-device-headline')).toHaveAttribute('data-state','up_to_date');
  await expect(page.getByTestId('admin-device-summary')).not.toContainText('Ninguna disponible');
  await expect(page.getByTestId('ps-setup')).not.toContainText('pse_');
  await expect(page.getByTestId('ps-setup-limits')).toHaveCount(0);
  for(const step of ['download','flash','boot'])await expect(page.getByTestId('ps-setup-step-'+step)).toHaveAttribute('data-state','manual');
  await expect(page.getByTestId('dev-rotations-details')).not.toHaveAttribute('open');
  await expect(page.getByTestId('dev-label-replacement-ready')).toHaveCount(1);
  await expect(page.locator('#ps469-diagnostics details')).not.toHaveAttribute('open');
  await expect(page.getByTestId('ps-unlink')).toBeDisabled();
  await expect(page.locator('.ps469-unlink')).toContainText('Este equipo heredado no se puede desvincular.');
  await expect(page.locator('.ps469-unlink')).not.toContainText('permiso');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'no horizontal overflow');
 }
 await page.screenshot({path:`${out}/${phase}-${width}.png`,fullPage:true});
 report.views.push({width,assets:await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src'))),scroll:await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth})),nav:await page.locator('.ps469-sections').innerText(),protection});
 if(phase==='after'){
  await page.goto(origin+'/admin/print-servers/devices/'+realId+'#ps469-certificates');
  await expect(page.locator('#ps469-certificates')).toHaveAttribute('open','');
  await expect(page.locator('.ps600-network #ps469-certificates')).toHaveCount(1);
  report.views.at(-1).oldCertificateAnchor={hash:new URL(page.url()).hash,open:true};
  await page.locator('#ps469-certificates').screenshot({path:`${out}/after-certificates-${width}.png`});
 }
 assertGuard(protection);await ctx.close();
}report.pass=true;}catch(e){report.failure=e.message;throw e;}finally{await browser.close();await writeFile(`${out}/${phase}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
