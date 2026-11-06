// PE-575: one real DEV creation + invitation entry + edit; server search/pagination.
// Reruns resume the same request from the evidence journal, never generate a second venue.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const origin = 'https://playerp.dev.bmore.app';
assert(!process.env.PORTAL_TEST_ORIGIN || process.env.PORTAL_TEST_ORIGIN === origin);
const out = process.env.LIVE_OUTPUT_DIR || 'test-results/pe575-dev'; await mkdir(out,{recursive:true});
const reportPath = `${out}/report.json`;
const saved = await readFile(reportPath,'utf8').then(JSON.parse).catch(()=>null);
const report = saved || {origin,at:new Date().toISOString(),stamp:Date.now().toString(36),checks:{}};
delete report.failure;
report.passed=false;
const stamp = report.stamp;
const accounts = JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
const defaults = await readFile(new URL('../build/dev-defaults.ts',import.meta.url),'utf8');
const key = defaults.match(/SUPABASE_PUBLIC_KEY\s*=\s*['"]([^'"]+)/)[1];
const api = 'https://fzwzmwstxlsxdzdmphyq.supabase.co';
const login = await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:accounts.staff_activo.email,password:accounts.staff_activo.password})});
assert.equal(login.status,200); const session = await login.json();
const journal = () => writeFile(reportPath,JSON.stringify(report,null,2));
async function rpc(name, body={}, token=session.access_token) {
 const r = await fetch(`${api}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal(r.status,200,`RPC ${name}`); return r.json();
}
const browser = await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const context = await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(s=>{if(!sessionStorage.getItem('pe575.init')){localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');sessionStorage.setItem('pe575.init','1');}},session);
const page = await context.newPage(); page.setDefaultTimeout(30000);
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const calls=[]; page.on('request',r=>{if(r.url().includes('/rest/v1/rpc/'))calls.push({name:r.url().split('/').pop(),body:r.postDataJSON()});});
try {
 await page.goto(origin+'/admin');
 await expect(page.getByTestId('new-tenant')).toBeVisible();
 const home = await rpc('portal_tenant_readiness_list',{p_page:1,p_page_size:5});
 assert(home.total>100); await expect(page.locator('.stat-card').first().locator('strong')).toHaveText(String(home.total));
 await page.screenshot({path:`${out}/1-admin.png`,fullPage:true});
 await page.goto(origin+'/admin/tenants');
 await expect(page.getByTestId('tenants-pagination-next')).toBeEnabled();
 await page.getByTestId('tenants-pagination-next').click();
 await expect(page.getByTestId('tenants-pagination-input')).toHaveValue('2');
 await page.getByTestId('tenants-search').fill('PE575');
 await expect.poll(()=>calls.some(c=>c.name==='portal_tenant_readiness_list'&&c.body.p_query==='PE575'&&c.body.p_page===1)).toBe(true);
 await expect(page.getByTestId('tenants-pagination-input')).toHaveValue('1');
 await expect(page.locator('.directory-row').first()).toBeVisible();
 assert(calls.some(c=>c.name==='portal_tenant_readiness_list'&&c.body.p_page===2));
 assert(!calls.some(c=>c.name==='portal_tenant_directory'));
 await page.getByTestId('tenants-search').click();
 assert.equal(await page.getByTestId('tenants-search').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
 const positions = await page.evaluate(()=>({list:document.querySelector('.directory-list').getBoundingClientRect().bottom,pager:document.querySelector('.ps-pagination').getBoundingClientRect().top}));
 assert(positions.pager>=positions.list);
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('.directory-row .status-badge').first()).toBeVisible();
 await page.getByRole('button',{name:'EN',exact:true}).click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`${out}/2-directory-mobile-en.png`,fullPage:true});
 report.checks.directory={total:home.total,summary:home.summary,page2:true,search:'PE575',serverOnly:true,pagerAtEnd:true,mouseOutline:'none',keyboardOutline:'solid',mobileWidth:390}; await journal();
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'ES',exact:true}).click();
 if (!report.venue_id) {
   await page.goto(origin+'/admin/tenants/new');
   if (report.request_key) {
     // Restore the same operation if an earlier test run stopped after sending it.
     await page.evaluate(({userId,requestKey,form})=>sessionStorage.setItem(`playerp.portal.newTenant.${userId}`,JSON.stringify({request_key:requestKey,form,submitted:true})),{userId:session.user.id,requestKey:report.request_key,form:report.form});
     await page.reload();
   } else {
     await page.getByLabel('Nombre del local *').fill(`PE575 Uma ${stamp}`);
     await page.getByLabel('Ciudad').fill('San Juan');
     await page.getByLabel('Dirección').fill('DEV test venue');
     await page.getByLabel('Correo electrónico',{exact:true}).fill(`delivered+pe368-uma-${stamp}@resend.dev`);
     await page.getByRole('button',{name:'Continuar',exact:true}).click();
     await page.getByLabel('Correo del owner *').fill(`delivered+pe368-uma-${stamp}@resend.dev`);
     await page.getByLabel('Nombre *',{exact:true}).fill('Prueba');
     await page.getByLabel('Apellidos *').fill('Uma');
     await page.getByRole('button',{name:'Continuar',exact:true}).click();
     await page.screenshot({path:`${out}/3-review.png`,fullPage:true});
     // The real backend completes, but the browser loses its response. Reload recovers it.
     await page.route('**/functions/v1/platform-tenant-onboard',async route=>{
       const body=route.request().postDataJSON();
       if(body.action!=='create')return route.continue();
       const draft=await page.evaluate(uid=>JSON.parse(sessionStorage.getItem(`playerp.portal.newTenant.${uid}`)),session.user.id);
       assert.equal(draft.submitted,true);assert.equal(draft.request_key,body.request_key);
       report.request_key=body.request_key;report.form=draft.form;await journal();
       const response=await route.fetch();assert.equal(response.status(),200);
       const result=await response.json();report.venue_id=result.venue_id;report.create_status=result.status;await journal();
       await route.abort('failed');
     });
     await page.getByRole('button',{name:'Crear tenant',exact:true}).click();
     await expect.poll(()=>report.venue_id,{timeout:90000}).toBeTruthy();
     await page.unroute('**/functions/v1/platform-tenant-onboard');
     await page.reload();
   }
   await expect(page.getByText('Tenant creado',{exact:true})).toBeVisible({timeout:60000});
   const state=await rpc('platform_tenant_onboarding_get',{p_request_key:report.request_key});
   assert.equal(state.venue_id,report.venue_id);assert.equal(state.status,'completed');
   report.checks.recovery={responseLost:true,reloadRecovered:true,request_key:report.request_key,venue_id:state.venue_id,attempts:state.attempts};await journal();
 }
 const unique=await rpc('portal_tenant_readiness_list',{p_query:`pe575-uma-${stamp}`});
 assert.equal(unique.total,1);assert.equal(unique.items[0].venue_id,report.venue_id);
 report.checks.recovery={...report.checks.recovery,uniqueVenueCount:unique.total};
 report.venue_url=origin+'/admin/tenants/'+report.venue_id;
 await page.goto(report.venue_url);
 await expect(page.getByText('Checklist de preparación',{exact:true})).toBeVisible();
 for(const k of ['basic_info','owner_access','stripe_connect','domain','operations'])await expect(page.locator(`[data-readiness="${k}"]`)).toBeVisible();
 if (!report.checks.edit) {
   await page.getByRole('button',{name:'Editar ficha',exact:true}).click();
   await page.getByLabel('Teléfono',{exact:true}).fill('7875550175');
   await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
   await expect(page.getByText('Cambios guardados.',{exact:true})).toBeVisible();
   await expect(page.locator('.detail-grid')).toContainText('7875550175');
   const edits=calls.filter(c=>c.name==='update_tenant_info');assert.equal(edits.length,1);assert.deepEqual(edits[0].body.p_fields,{phone:'7875550175'});
   report.checks.edit={saved:true,fields:edits[0].body.p_fields};await journal();
 }
 await page.screenshot({path:`${out}/4-edited-checklist.png`,fullPage:true});
 if (!report.checks.owner) {
   const mailboxKey=(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/buzon.key','utf8')).trim();
   const mr=await fetch(api+'/functions/v1/pe368-dev-test-mailbox',{method:'POST',headers:{Authorization:`Bearer ${key}`,'x-pe321-mailbox-key':mailboxKey,'Content-Type':'application/json'},body:JSON.stringify({to:report.form.owner_email,kind:'invite'})});
   assert.equal(mr.status,200);const mail=await mr.json();assert(mail.pending&&mail.link);assert.equal(new URL(mail.link).origin,api);
   const ownerContext=await browser.newContext({viewport:{width:390,height:844}});const owner=await ownerContext.newPage();
   owner.setDefaultTimeout(30000);await owner.goto(mail.link);
   await expect(owner.getByLabel('Contraseña nueva',{exact:true})).toBeVisible();
   const password=randomBytes(24).toString('base64url')+'-aA1!';
   await owner.getByLabel('Contraseña nueva',{exact:true}).fill(password);
   await owner.getByLabel('Confirmar contraseña nueva',{exact:true}).fill(password);
   await owner.getByRole('button',{name:'Guardar contraseña nueva',exact:true}).click();
   await expect(owner.getByRole('link',{name:'Continuar a PlayERP',exact:true})).toBeVisible();
   await owner.getByRole('link',{name:'Continuar a PlayERP',exact:true}).click();
   await expect.poll(()=>new URL(owner.url()).pathname).toBe('/');
   await expect(owner.getByRole('heading',{name:`PE575 Uma ${stamp}`,exact:true})).toBeVisible();
   const ownerSession=await owner.evaluate(()=>JSON.parse(localStorage.getItem('playerp.portal.dev.auth')));
   const access=await rpc('portal_access',{},ownerSession.access_token);
   assert.deepEqual(access.owner_venues.map(v=>v.id),[report.venue_id]);assert.equal(access.is_platform_staff,false);
   report.checks.owner={invitationOpened:true,passwordSaved:true,portalEntered:true,owner_venues:access.owner_venues.map(v=>v.id),manualPortalAccess:false};await journal();
   await owner.screenshot({path:`${out}/5-owner-mobile.png`,fullPage:true});await ownerContext.close();
 }
 const readiness=await rpc('portal_tenant_readiness',{p_venue_id:report.venue_id});
 assert.equal(readiness.is_active,false);assert.equal(readiness.lifecycle,'setup_incomplete');
 assert.equal(readiness.items.find(i=>i.key==='owner_access').state,'accepted');
 report.checks.readiness=readiness;
 report.errors=errors;assert.deepEqual(errors,[]);report.passed=true;
} catch(e) { report.failure=String(e).replace(/https?:\/\/\S*access_token\S*/g,'[redacted]'); await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{}); }
finally {await journal();await browser.close();}
console.log(JSON.stringify({passed:report.passed,failure:report.failure,venue_url:report.venue_url,checks:Object.keys(report.checks)},null,2));
if(report.failure)process.exit(1);
