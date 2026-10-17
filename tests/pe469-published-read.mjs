// Read-only DEV verification; only PE-443/462 fixture devices. Never clicks mutations.
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin='https://playerp.dev.bmore.app',api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const config=await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');const key=config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];
const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
const login=await fetch(`${api}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:accounts.staff_activo.email,password:accounts.staff_activo.password})});assert.equal(login.status,200);const session=await login.json();
const fixtures=JSON.parse(await readFile(new URL('../docs/evidence/pe469/live-contract.json',import.meta.url),'utf8'));
const out='docs/evidence/pe469/published';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const report={origin,readOnly:true,fixtureVenue:fixtures.fixtureVenue,views:[],blocked:[],errors:[]};
const allowed=['portal_access','is_platform_staff','portal_tenant_directory','portal_tenant_detail','ps_panel_devices','ps_device_resolve','ps_admin_device_detail','ps_admin_device_manage','ps_admin_device_sheet','ps_panel_state','ps_panel_device','ps_panel_recovery_label','ps_panel_printer_jobs','ps_admin_legacy_credentials_context','ps_panel_ota'];
try{for(const width of [390,1440]){
 const ctx=await browser.newContext({viewport:{width,height:1000},locale:'es-ES'});await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},session);
 await ctx.route('**/rest/v1/rpc/*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(!allowed.includes(name)){report.blocked.push(name);return route.abort();}return route.continue();});
 await ctx.route('**/functions/v1/*',route=>{report.blocked.push(new URL(route.request().url()).pathname);return route.abort();});
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+`/admin/tenants/${fixtures.fixtureVenue}/print-servers`);await expect(page.getByTestId('venue-print-servers')).toBeVisible();await page.screenshot({path:`${out}/c4-live-list-${width}.png`,fullPage:true});
 for(const r of fixtures.resolved.filter(r=>r.link.serial==='PS-PE462ASG'||r.link.state==='pendiente_preparacion')){
  await page.goto(origin+r.canonical_path+`?fromVenue=${fixtures.fixtureVenue}`);await expect(page.getByTestId('ps-device-sheet')).toHaveAttribute('data-device-id',r.device_id);await expect(page.locator('h1')).toHaveCount(1);await expect(page.getByTestId('ps-device-title')).toContainText(r.display_name);
  await page.screenshot({path:`${out}/c4-live-${r.serial}-${width}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.reload();await expect(page.getByTestId('ps-sheet-back')).toHaveAttribute('href',`/admin/tenants/${fixtures.fixtureVenue}/print-servers?selected=${r.device_id}`);report.views.push({width,device_id:r.device_id,path:r.canonical_path,uniqueHeading:true,refreshContext:true});
 }
 await ctx.close();
}const html=await(await fetch(origin)).text();report.htmlSha256=createHash('sha256').update(html).digest('hex');report.assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(x=>x[1]);assert.deepEqual(report.blocked,[]);assert.deepEqual(report.errors,[]);report.pass=true;}catch(e){report.pass=false;report.failure=e.message;throw e;}finally{await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
