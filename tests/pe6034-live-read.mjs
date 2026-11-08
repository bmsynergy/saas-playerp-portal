// Reads only the authorized DEV device. No actions, credentials revealed, or LAN request.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {origin,login,launch,context,guard,assertGuard} from './helpers/pe600-readonly.mjs';
const out='docs/evidence/pe6034/published-live';await mkdir(out,{recursive:true});
const device='34fd3ff8-f558-4d39-a805-834264d8f6bc',venue='a0000000-0000-0000-0000-000000000001';
const report={origin,kind:'Live DEV read-only; QA account has both platform admin and venue owner roles; no physical LAN access',views:[],errors:[]};
const browser=await launch();
try{
 const session=await login();
 for(const scope of ['owner','admin'])for(const lang of ['es','en'])for(const width of [390,1440]){
  const ctx=await context(browser,session,width,lang);const protection={};await guard(ctx,protection);
  await ctx.addInitScript(({id,scope})=>sessionStorage.setItem('playerp.portal.scope.'+id,scope),{id:session.user.id,scope});
  const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  const path=scope==='owner'?`/?venue=${venue}&section=print-servers&device=${device}`:`/admin/print-servers/devices/${device}`;
  await page.goto(origin+path);const about=page.getByTestId('ps-about');await expect(about).toBeVisible({timeout:30000});
  const link=page.getByTestId('ps-open-portal');await expect(link).toHaveAttribute('href','https://playerp-ps-5easg93m.local:8443/',{timeout:30000});
  for(const fact of ['PS-5EASG93M','rpi4-2gb','arm64','0.3.28','playerp-ps-5easg93m','10.0.0.128:8443'])await expect(about).toContainText(fact);
  await expect(page.getByTestId('ps-technical-details')).toHaveCount(0);
  if(scope==='owner')for(const id of ['ps-unlink','admin-device-channel','ps-stock','https-renew','https-upload'])await expect(page.getByTestId(id)).toHaveCount(0);
  const diag=page.getByTestId('ps-diagnostics-details');await expect(diag).toBeVisible();await diag.locator('summary').click();
  await expect(diag).not.toContainText('https://');await expect(diag.locator('details')).toHaveCount(0);
  await page.locator('a[href="#ps469-overview"]').click();
  const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(dimensions.width,dimensions.scrollWidth);
  // About crop shows actual reported facts without any credential/QR section.
  const screenshot=`${scope}-${lang}-${width}.png`;await about.screenshot({path:`${out}/${screenshot}`});
  assertGuard(protection);report.views.push({scope,lang,...dimensions,url:origin+path,screenshot,href:await link.getAttribute('href'),assets:await page.locator('script[src]').evaluateAll(ns=>ns.map(n=>n.getAttribute('src'))),blocked:protection.blocked,readEndpoints:[...new Set(protection.reads)]});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=e.message;throw e;}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
