// UI from downloaded signed package; radio/system/cloud mocked by Tom's ActivationBase.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
const out='docs/evidence/pe469/activation';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const checks=[];
try{for(const width of [390,1440]){
 const ctx=await browser.newContext({viewport:{width,height:1000}});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.hostname!=='10.77.0.1')return route.abort();
  const headers={...req.headers(),host:'127.0.0.1',origin:'http://127.0.0.1'};delete headers['content-length'];delete headers['connection'];if(req.postData())headers['content-length']=String(Buffer.byteLength(req.postData()));
  const response=await new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port:18798,path:url.pathname+url.search,method:req.method(),headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});r.on('error',reject);r.setTimeout(5000,()=>r.destroy(new Error('fixture_timeout')));r.end(req.postData()??undefined);});
  const responseHeaders=Object.fromEntries(Object.entries(response.headers).map(([k,v])=>[k,Array.isArray(v)?v.join('\n'):v]));
  return route.fulfill({status:response.status,headers:responseHeaders,body:response.body});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(10000);await page.goto('http://10.77.0.1');await page.locator('#code').fill('correct-code');await page.locator('#enter').click();await expect(page.locator('#activation-panel')).toBeVisible();
 await page.screenshot({path:`${out}/c3-real-field-${width}.png`,fullPage:true});
 await page.locator('#activation-code').fill('pse_'+'ab'.repeat(32));await page.locator('#activation-submit').click();await expect(page.locator('#activation-next')).toBeVisible();
 await page.screenshot({path:`${out}/c3-waiting-network-${width}.png`,fullPage:true});
 assert(!JSON.stringify(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).includes('pse_'));
 await page.locator('#activation-cancel').click();await expect(page.locator('#activation-form')).toBeVisible();checks.push({width,field:true,authenticatedPost:true,waitingNetwork:true,cancel:true,storageNoSecret:true});await ctx.close();
}await writeFile(`${out}/checks.json`,JSON.stringify({simulated:'Downloaded 0.3.23 package; radio/system/cloud mocked, HTTP proxied to 127.0.0.1:18798; no physical hotspot.',checks},null,2));console.log('PASS local activation field + memory/network handoff 390/1440');}finally{await browser.close();}
