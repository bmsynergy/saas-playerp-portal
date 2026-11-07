import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {origin as published,api,login,launch,context,guard,assertGuard} from './helpers/pe600-readonly.mjs';
const origin=process.env.PORTAL_TEST_ORIGIN??published;
assert([published,'http://127.0.0.1:18799'].includes(origin));
const out='docs/evidence/pe6015',id='72e06b4f-a63e-49e9-bd06-f02b8a9186a1',phase=origin===published?'published':'local';
const browser=await launch(),report={origin,phase,device:id,kind:'Real DEV API and existing test inventory; no hardware',views:[],errors:[]};
try{
 const s=await login();
 for(const width of [1440,390]){
  const ctx=await context(browser,s,width);await ctx.grantPermissions(['clipboard-read','clipboard-write']);const protection={};let reads=0,expected;
  await guard(ctx,protection,async(route,{req,u,name})=>{
   if(u.origin===origin&&['GET','HEAD'].includes(req.method())){await route.continue();return true;}
   if(u.origin===api&&name==='ps_admin_stock_reserved_credentials'){
    assert.equal(req.postDataJSON().p_device_id,id,'only test fixture reservation');reads++;
    const res=await route.fetch();const d=await res.json();assert.equal(d.status,'reserved_pending_confirmation');assert(!/pse_|pst_|PRIVATE KEY/.test(JSON.stringify(d)));expected=d.reserved;await route.fulfill({response:res});return true;
   }
   return false;
  });
  const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  const url=origin+'/admin/print-servers/devices/'+id;
  await p.goto(url);await expect(p.getByTestId('ps-stock-reserved')).toContainText('Pendientes de confirmación',{timeout:30000});
  const firstReads=reads;await p.reload();await expect(p.locator('.ps-stock-reserved-value')).toHaveCount(3,{timeout:30000});assert(reads>firstReads,'reload fetched reservations');
  const afterReload=reads;await p.goto(origin+'/admin');await p.goto(url);await expect(p.locator('.ps-stock-reserved-value')).toHaveCount(3,{timeout:30000});assert(reads>afterReload,'return fetched reservations');
  assert(JSON.stringify(await p.locator('.ps-stock-reserved-value').allTextContents())===JSON.stringify([expected.ssid,expected.psk,expected.admin_code]),'display matches reserved values');
  for(const [i,field] of ['ssid','psk','admin_code'].entries()){
   await p.locator('.ps-stock-copy').nth(i).click();assert(await p.evaluate(()=>navigator.clipboard.readText())===expected[field],'copied reserved '+field);
  }
  await expect(p.getByTestId('ps-stock-get-label')).toBeDisabled();await expect(p.getByTestId('ps-stock-download-file')).toBeDisabled();
  await expect(p.getByTestId('ps-stock')).toContainText('playerp-ps-image-0.3.28-dev.img.xz');
  const text=await p.locator('body').innerText();assert(!/ethernet|pse_|pst_|PRIVATE KEY/i.test(text),'no wired instructions or technical secrets');
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await p.evaluate(()=>window.scrollTo(0,0));
  // These are valid DEV reservations: mask all credential values in persistent screenshots.
  const mask=[p.locator('.ps-stock-reserved-value')];
  await p.screenshot({path:`${out}/${phase}-${width}.png`,fullPage:true,mask,maskColor:'#cbd5e1'});
  await p.getByTestId('ps-stock').screenshot({path:`${out}/${phase}-stock-${width}.png`,mask,maskColor:'#cbd5e1',style:'.topbar{visibility:hidden}'});
  report.views.push({width,reservationReads:reads,reloadAndReturn:true,copyMatches:true,labelDisabled:true,fileNotRegenerated:true,image:'0.3.28',noEthernet:true,noTechnicalSecrets:true,noOverflow:true,assets:await p.locator('script[src]').evaluateAll(ns=>ns.map(n=>n.getAttribute('src'))),protection});
  assertGuard(protection);await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
}finally{await browser.close();await writeFile(`${out}/${phase}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
