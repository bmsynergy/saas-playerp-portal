// Layout and selection checks against the real frontend with isolated API fixtures. Never deploys firmware.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.SMOKE_OUTPUT_DIR??'test-results/pe417';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const date='2026-10-12T17:00:00Z',longHost='playerp-print-server-very-long-hostname-'.repeat(4);
const devices=Array.from({length:8},(_,i)=>({print_server_id:`ps-${i}`,hostname:i===0?longHost:`Printer ${i}`,venue_name:i===0?'A venue with a longer name that should wrap naturally':'Fixture Venue',serial:`PS-${i}`,installed_version:i===7?null:'0.3.15',last_seen_at:i===7?null:date,online:i%2===0}));
const report={origin,api:'isolated fixtures, no backend mutations',layouts:[],selection:[],errors:[]};
try{
 for(const lang of ['en','es']){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:lang});
  await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
  await ctx.route(url=>!url.href.startsWith(origin),async route=>{
   const url=new URL(route.request().url()),name=url.pathname.split('/').pop();
   const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
   if(url.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
   if(name==='staff_profiles')return send(null);
   if(name==='portal_access')return send({is_platform_staff:true,platform_role:'super_admin',owner_venues:[]});
   if(name==='is_platform_staff')return send(true);
   if(name==='portal_tenant_directory')return send([]);
   if(name==='portal_ps_devices')return send({devices:devices.slice().reverse().map(d=>({id:`inventory-${d.print_server_id}`,print_server_id:d.print_server_id,model:d.print_server_id==='ps-7'?null:'Raspberry Pi 4 Model B'}))});
   if(name==='ps_ota_admin_overview')return send({ok:true,keys:[],releases:[],groups:[{id:'group-1',name:'Lab',ring:'lab',members:['ps-1']}],devices,deployments:[],audit:[]});
   if(['ps_ota_admin_deployments_page','ps_ota_admin_audit_page'].includes(name))return send({ok:true,total:0,items:[],limit:25,offset:0,aggregates:{}});
   report.errors.push(`Unexpected request ${name}`);return route.abort();
  });
  const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin+'/admin/print-servers/updates');
  await page.getByTestId('ota-deploy-mode').selectOption('devices');
  const picker=page.locator('.ota-deploy-devices'),cards=picker.locator('.ota-device-card');
  await expect(cards).toHaveCount(8);
  await expect(cards.first().locator('.ota-device-hostname')).toHaveAttribute('title',longHost);
  await expect(cards.first()).toContainText('Raspberry Pi 4 Model B');
  await expect(cards.first()).toContainText('0.3.15');
  await expect(cards.first().locator('time')).toHaveAttribute('datetime',date);
  for(const width of [1920,1440,1200,1024,834,390,320]){
   await page.setViewportSize({width,height:1000});await picker.scrollIntoViewIfNeeded();
   const metrics=await cards.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),input=el.querySelector('input').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scroll:el.scrollWidth,client:el.clientWidth,checkbox:input.width,wrap:getComputedStyle(el.querySelector('.ota-device-content')).overflowWrap};}));
   const columns=metrics.filter(m=>Math.abs(m.y-metrics[0].y)<1).length;
   assert.equal(columns,width<=1024?1:width>=1440?3:2);
   assert.ok(metrics.every(m=>m.width>=(width===320?230:280)&&m.scroll<=m.client&&m.checkbox===18&&m.wrap==='normal'),JSON.stringify({width,metrics}));
   assert.ok(await picker.evaluate(el=>el.scrollWidth<=el.clientWidth));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   report.layouts.push({lang,width,columns,minCardWidth:Math.min(...metrics.map(m=>m.width)),heights:metrics.slice(0,2).map(m=>m.height),noOverflow:true});
   if([1440,1200,834,390].includes(width))await picker.screenshot({path:`${out}/${lang}-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});
  await cards.nth(0).click();await cards.nth(1).click();
  await page.getByTestId('ota-deploy-device-ps-2').focus();await page.keyboard.press('Space');
  await expect(picker.locator('[data-selected=true]')).toHaveCount(3);
  await expect(page.getByTestId('ota-deploy-device-summary')).toHaveText(lang==='en'?'3 of 8 devices selected':'3 de 8 aparatos seleccionados');
  const colors=await cards.evaluateAll(els=>[getComputedStyle(els[0]).backgroundColor,getComputedStyle(els[3]).backgroundColor]);assert.notEqual(...colors);
  await page.getByTestId('ota-deploy-device-search').fill('Printer 7');await expect(cards).toHaveCount(1);
  await expect(page.getByTestId('ota-deploy-device-summary')).toContainText(lang==='en'?'3 of 8':'3 de 8');
  await page.getByTestId('ota-deploy-device-search').fill('');await expect(cards).toHaveCount(8);
  await expect(page.getByTestId('ota-deploy-device-ps-0')).toBeChecked();
  await picker.screenshot({path:`${out}/${lang}-selected.png`});
  report.selection.push({lang,pointerAndKeyboard:true,selected:3,total:8,filterPreservesSelection:true,distinctBackground:true,hostnameTitle:true,allFields:true});
  await ctx.close();
 }
 assert.deepEqual(report.errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
