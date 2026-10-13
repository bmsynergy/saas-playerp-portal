// Read-only DEV verification. Existing test identity; no business writes.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app','http://127.0.0.1:18799'].includes(origin));
const out=process.env.LIVE_OUTPUT_DIR??'test-results/pe431-live';await mkdir(out,{recursive:true});
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const key=(await readFile('src/lib/config.ts','utf8')).match(/SUPABASE_PUBLIC_KEY\s*=\s*"([^"]+)"/)[1];
const account=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8')).staff_activo;
const auth=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});assert.equal(auth.status,200);
const session=await auth.json();session.expires_at=Math.floor(Date.now()/1000)+session.expires_in;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const report={origin,at:new Date().toISOString(),overview:[],auditCalls:0,widths:[],errors:[]};
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:950},permissions:['clipboard-read','clipboard-write']});
 await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','en');},session);
 const page=await ctx.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));
 const pending=[];
 page.on('response',res=>{if(res.url().endsWith('/rpc/ps_ota_admin_overview'))pending.push((async()=>{const data=await res.json();assert.equal(res.status(),200);assert.equal(res.request().postDataJSON().p_include_audit,false);assert.equal(data.audit_included,false);assert(!Object.hasOwn(data,'audit'));report.overview.push({http:res.status(),auditIncluded:data.audit_included,auditPresent:Object.hasOwn(data,'audit')});})());});
 page.on('request',req=>{if(req.url().endsWith('/rpc/ps_ota_admin_audit_page'))report.auditCalls++;});
 await page.goto(origin+'/admin/print-servers/updates?lang=en');await expect(page.getByTestId('ota-audit-start')).toBeVisible();
 await page.waitForTimeout(11000);await Promise.all(pending);assert(report.overview.length>0);assert.equal(report.auditCalls,0);report.initialAuditCalls=0;
 await page.getByTestId('audit-search').fill('ps_ota');assert.equal(report.auditCalls,0);await page.getByTestId('audit-search').fill('');
 await page.getByTestId('ota-audit-search').click();await expect(page.getByTestId('audit-pagination-range')).toBeVisible();assert.equal(report.auditCalls,1);
 report.range=await page.getByTestId('audit-pagination-range').innerText();
 await page.getByTestId('audit-pagination-size').selectOption('10');
 const input=page.getByTestId('audit-pagination-input');await input.fill('0');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');
 if(await page.getByTestId('audit-pagination-next').isEnabled()){
  await input.fill('2');await input.press('Enter');await expect(input).toHaveValue('2');await expect(page.getByTestId('audit-pagination-range')).toContainText('11');
  await page.getByTestId('audit-pagination-prev').click();await expect(input).toHaveValue('1');report.directJump=true;
 }
 const detail=page.getByTestId('ota-audit').locator('details').first();await detail.locator('summary').click();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:950});await detail.scrollIntoViewIfNeeded();const box=await detail.boundingBox(),row=await detail.locator('..').boundingBox();assert(box.width>row.width-40);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await detail.getByRole('button').click();await expect(detail.getByRole('status')).toContainText('Copied');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await detail.locator('pre').textContent());report.widths.push({width,fullWidth:true,copyExact:true});
 }
 await page.reload();await expect(page.getByTestId('ota-audit-start')).toBeVisible();await expect(page.getByTestId('ota-audit')).toHaveCount(0);await Promise.all(pending);assert.deepEqual(report.errors,[]);report.passed=true;
}finally{
 await browser.close();await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token}});await writeFile(out+'/report.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
