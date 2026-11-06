// Controlled browser faults on a real DEV read session. Mutation responses are intercepted: no writes.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {devSession} from './pe577-session.mjs';
const origin='http://127.0.0.1:18799';const out='test-results/pe577-states';await mkdir(out,{recursive:true});
const fixture=JSON.parse(await readFile('test-results/pe577/report.json','utf8'));
const {session,rpc}=await devSession();const address=await rpc('platform_venue_address',{p_venue_id:fixture.venue_id});
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},session);
const page=await context.newPage();page.setDefaultTimeout(20000);
const report={syntheticFaults:true,liveReadVenue:fixture.venue_id,checks:{},passed:false};
const panel=page.locator('.platform-subdomain-panel');
const routeName='**/rpc/platform_venue_subdomain_change';
const go=async()=>{await page.goto(origin+'/admin/tenants/'+fixture.venue_id);await expect(panel.locator('.platform-subdomain-current')).toBeVisible();await panel.getByRole('button',{name:'Cambiar subdominio',exact:true}).click();};
const preview=async(label=fixture.stamp+'-states')=>{await panel.locator('input').fill(label);await expect(panel.locator('.platform-subdomain-available')).toBeVisible();await panel.getByRole('button',{name:'Revisar cambio',exact:true}).click();await expect(panel.locator('.platform-subdomain-confirm')).toBeVisible();};
try{
 for(const [code,expected] of [['stale_current','La dirección cambió'],['platform_subdomain_unavailable','no está disponible']]){
  let writes=0;
  await page.route(routeName,async route=>{if(!route.request().postDataJSON().p_confirm)return route.continue();writes++;await new Promise(r=>setTimeout(r,300));await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'PT409',message:code})});});
  await go();await preview();
  await panel.getByRole('button',{name:'Confirmar cambio',exact:true}).evaluate(el=>{el.click();el.click();});
  await expect(panel.getByRole('alert')).toContainText(expected);assert.equal(writes,1);assert.equal(await panel.locator('.platform-subdomain-success').count(),0);
  await panel.getByRole('button',{name:'Recargar dirección',exact:true}).click();await expect(panel.locator('.platform-subdomain-current')).toContainText(address.platform_subdomain.domain);
  report.checks[code]={oneRequest:true,noFalseSuccess:true,reload:true};await page.unroute(routeName);
 }
 // Stale slow availability must not overwrite a newer invalid value.
 await go();await page.route('**/rpc/platform_subdomain_check',async route=>{if(route.request().postDataJSON().p_subdomain==='slow-free'){await new Promise(r=>setTimeout(r,900));return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({subdomain:'slow-free',domain:'slow-free.playerp.dev.bmore.app',available:true,reason:null,environment_state:'pending_relocation'})});}return route.continue();});
 await panel.locator('input').fill('slow-free');await page.waitForRequest(r=>r.url().endsWith('platform_subdomain_check')&&r.postDataJSON()?.p_subdomain==='slow-free');await panel.locator('input').fill('admin');await expect(panel.locator('.platform-subdomain-invalid')).toBeVisible();await page.waitForTimeout(1000);await expect(panel.getByRole('button',{name:'Revisar cambio',exact:true})).toBeDisabled();report.checks.staleAvailabilityIgnored=true;
 // Existing value is clearly current, and cannot be sent again.
 await panel.locator('input').fill(address.platform_subdomain.label);await expect(panel).toContainText('Es la dirección actual');await expect(panel.getByRole('button',{name:'Revisar cambio',exact:true})).toBeDisabled();report.checks.currentNotError=true;
 // PROD formatting and contradictory readiness are UI fixtures, never a PROD connection.
 const production=structuredClone(address);production.environment={...production.environment,environment:'prod',base:'playerp.net',base_status:'live'};production.slug='dynamicparkpr';production.external_primary={domain:'dynamicparkpr.com',status:'verified'};production.platform_subdomain={...production.platform_subdomain,label:'dynamicpark',domain:'dynamicpark.playerp.net',operational:true,public_url:'https://dynamicpark.playerp.net',environment_state:'pending_relocation',serving_state:'verified'};
 await page.route('**/rpc/platform_venue_address',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(production)}));await page.reload();await expect(panel.locator('.platform-subdomain-current')).toContainText('dynamicpark.playerp.net');assert.equal(await panel.locator('a').count(),0);await expect(panel).not.toContainText('dynamicparkpr.com');report.checks.prodAddressFromServerAndPendingNotLinked=true;
 await page.goto(origin+'/admin/tenants/new');await page.getByLabel('Nombre del local *').fill('PE577 Mobile');await expect(page.locator('.platform-subdomain-available')).toBeVisible();
 const heights=await page.locator('.nt-form .field-control').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));assert(heights.every(h=>h===heights[0]));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.sharedHeights=heights;await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.getByLabel('PlayERP subdomain *')).toBeVisible();await page.screenshot({path:`${out}/new-mobile-en.png`,fullPage:true});report.checks.newMobileEn=true;
 report.passed=true;console.log(JSON.stringify(report));
}catch(e){report.failure=e.message;console.error(e.message);process.exitCode=1;await page.screenshot({path:`${out}/failure.png`,fullPage:true});}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
