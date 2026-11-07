import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {origin,out,login,launch,context,guard,assertGuard} from './helpers/pe600-readonly.mjs';
const report={origin,account:'owner_varios',views:[]};const browser=await launch();let ctx;
try{
 ctx=await context(browser,await login('owner_varios'));await guard(ctx,report);const page=await ctx.newPage();let access;
 page.on('response',async r=>{try{if(r.url().endsWith('/rpc/portal_access')&&r.ok())access=await r.json();if(r.url().endsWith('/rpc/ps_device_resolve')&&r.ok()){const d=await r.json();report.unlinkReason=d.capabilities?.unlink?.reason;report.serial=d.serial;}}catch{}});
 await page.goto(origin+'/');await expect.poll(()=>!!access,{timeout:30000}).toBe(true);assert.equal(access.is_platform_staff,false);
 const venues=access.owner_venues;assert(venues.length,'Owner has venues');report.venues=venues.map(v=>({id:v.id??v.venue_id,name:v.name??v.venue_name}));
 for(const venue of report.venues){await page.goto(origin+'/?venue='+venue.id+'&section=print-servers');await page.waitForTimeout(2000);const hrefs=await page.locator('a[href*="device="]').evaluateAll(as=>as.map(a=>a.getAttribute('href')));if(hrefs.length){await page.goto(origin+hrefs[0]);await expect(page.getByTestId('ps-device-sheet')).toBeVisible({timeout:15000});report.deviceUrl=page.url();break;}}
 await expect(page.getByTestId('ps-device-sheet')).toBeVisible();await expect(page.getByTestId('admin-device-channel')).toHaveCount(0);await expect(page.getByTestId('ps-setup')).toHaveCount(0);await expect(page.getByTestId('ps-stock')).toHaveCount(0);await expect(page.getByTestId('ps-unlink')).toHaveCount(0);await expect(page.locator('#ps469-firmware')).toHaveCount(1);
 await page.screenshot({path:out+'/owner-read.png',fullPage:true});report.views.push({url:page.url(),channel:false,setup:false,unlink:'absent'});assert.equal(report.unlinkReason,'forbidden');assertGuard(report);report.pass=true;
}catch(e){report.failure=e.message;throw e;}finally{await ctx?.close();await browser.close();await writeFile(out+'/owner-read.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
