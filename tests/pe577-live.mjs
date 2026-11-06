// Real DEV acceptance: a tagged, inactive fixture; no PROD writes or infrastructure changes.
import {chromium, expect} from '@playwright/test';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {devSession} from './pe577-session.mjs';
const origin=process.env.PORTAL_TEST_ORIGIN || 'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out=process.env.LIVE_OUTPUT_DIR || 'test-results/pe577';await mkdir(out,{recursive:true});
const reportPath=`${out}/report.json`;
const report=await readFile(reportPath,'utf8').then(JSON.parse).catch(()=>({stamp:'pe577-uma-'+Date.now().toString(36),checks:{}}));
report.origin=origin;report.passed=false;delete report.failure;
const journal=()=>writeFile(reportPath,JSON.stringify(report,null,2));
const {session,rpc}=await devSession();
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(s=>{if(!sessionStorage.getItem('pe577.init')){localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');sessionStorage.setItem('pe577.init','1');}},session);
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let changeWrites=0;page.on('request',r=>{if(r.url().endsWith('/rpc/platform_venue_subdomain_change')&&r.postDataJSON()?.p_confirm===true)changeWrites++;});
try {
 if(!report.venue_id) {
  await page.goto(origin+'/admin/tenants/new');
  if(report.request_key){
   await page.evaluate(({uid,key,form})=>sessionStorage.setItem(`playerp.portal.newTenant.${uid}`,JSON.stringify({request_key:key,form,submitted:true})),{uid:session.user.id,key:report.request_key,form:report.form});await page.reload();
  } else {
   await page.getByLabel('Nombre del local *').fill(report.stamp);
   const input=page.locator('#platform-subdomain');
   await expect(input).not.toHaveValue('');
   await expect(page.locator('.platform-subdomain-available')).toBeVisible();
   report.suggested=await input.inputValue();
   await input.fill('admin');await expect(page.locator('.platform-subdomain-invalid')).toBeVisible();
   await expect(page.getByRole('button',{name:'Continuar',exact:true})).toBeDisabled();
   await input.fill('bad_label');await expect(page.locator('.platform-subdomain-invalid')).toBeVisible();
   await input.fill('pe5771-t2-a2');await expect(page.locator('.platform-subdomain-unavailable')).toBeVisible();
   await input.fill(report.stamp+'-address');await expect(page.locator('.platform-subdomain-available')).toBeVisible();
   await expect(page.locator('.platform-subdomain-address')).toContainText(report.stamp+'-address.playerp.dev.bmore.app');
   assert.equal(await page.locator('.platform-subdomain-address a').count(),0);
   await page.getByRole('button',{name:'Continuar',exact:true}).click();
   await page.getByLabel('Correo del owner *').fill(`delivered+${report.stamp}@resend.dev`);
   await page.getByLabel('Nombre *',{exact:true}).fill('Prueba');await page.getByLabel('Apellidos *').fill('PE577 Uma');
   await page.getByRole('button',{name:'Continuar',exact:true}).click();
   await page.screenshot({path:`${out}/onboarding-review-es.png`,fullPage:true});
   page.on('request',async r=>{if(r.url().includes('/functions/v1/platform-tenant-onboard')&&r.postDataJSON()?.action==='create'){
    const body=r.postDataJSON();report.request_key=body.request_key;report.create_body=body;await journal();
   }});
   report.form=await page.evaluate(uid=>JSON.parse(sessionStorage.getItem(`playerp.portal.newTenant.${uid}`)).form,session.user.id);await journal();
   // Lose only the browser response after the real server transaction completes.
   let dropped=false;
   await page.route('**/functions/v1/platform-tenant-onboard',async route=>{
    if(route.request().postDataJSON()?.action!=='create' || dropped)return route.continue();
    const response=await route.fetch();assert.equal(response.status(),200);
    report.firstResult=await response.json();report.checks.lostResponse={request_key:report.request_key,firstVenue:report.firstResult.venue_id};await journal();dropped=true;await route.abort('failed');
   });
   await page.getByRole('button',{name:'Crear tenant',exact:true}).click();
   await expect(page.getByRole('button',{name:'Reintentar',exact:true})).toBeVisible({timeout:90000});
   await page.getByRole('button',{name:'Reintentar',exact:true}).click();
  }
  await expect(page.getByText('Tenant creado',{exact:true})).toBeVisible({timeout:90000});
  const status=await rpc('platform_tenant_onboarding_get',{p_request_key:report.request_key});
  report.venue_id=status.venue_id;report.create_status=status.status;
  assert.equal(status.status,'completed');
  if(report.firstResult){assert.equal(status.venue_id,report.firstResult.venue_id);report.checks.lostResponse.sameVenueOnRetry=true;}
  report.checks.creation={serverValidated:true,reservedRejected:true,invalidRejected:true,takenRejected:true,suggestion:report.suggested,request_key:report.request_key,venue_id:report.venue_id};await journal();
 }
 await page.goto(origin+'/admin/tenants/'+report.venue_id);
 const panel=page.locator('.platform-subdomain-panel');
 await expect(panel.locator('.platform-subdomain-current')).toBeVisible();
 const before=await rpc('platform_venue_address',{p_venue_id:report.venue_id});
 assert.equal(before.slug,report.form.slug);assert.equal(before.venue_state.is_active,false);
 assert.equal(before.environment.base,'playerp.dev.bmore.app');assert.equal(before.environment.current_app_url,'https://playerp.lovable.app');
 assert.equal(before.platform_subdomain.operational,false);assert.equal(before.platform_subdomain.public_url,null);
 assert.equal(await panel.locator('.platform-subdomain-current a').count(),0);
 await expect(panel).toContainText(before.platform_subdomain.domain);
 report.checks.environment={base:before.environment.base,current_app:before.environment.current_app_url,current_portal:before.environment.current_portal_url,environment:before.platform_subdomain.environment_state,serving:before.platform_subdomain.serving_state,active:false,linkCount:0};
 // Mark an intended correction before sending so this test resumes safely if interrupted.
 const corrected=report.stamp+'-corrected';
 if(before.platform_subdomain.label!==corrected){
  await panel.getByRole('button',{name:'Cambiar subdominio',exact:true}).click();
  const input=panel.locator('input');await input.fill('pe5771-t2-a2');await expect(panel.locator('.platform-subdomain-unavailable')).toBeVisible();
  await input.fill(corrected);await expect(panel.locator('.platform-subdomain-available')).toBeVisible();
  await panel.getByRole('button',{name:'Revisar cambio',exact:true}).click();
  const confirm=panel.locator('.platform-subdomain-confirm');await expect(confirm).toContainText(before.platform_subdomain.domain);await expect(confirm).toContainText(corrected+'.playerp.dev.bmore.app');
  const previewOnly=await rpc('platform_venue_address',{p_venue_id:report.venue_id});assert.deepEqual(previewOnly,before);
  await page.screenshot({path:`${out}/change-confirm-es.png`,fullPage:true});
  await confirm.getByRole('button',{name:'Confirmar cambio',exact:true}).click();
  await expect(panel.locator('.platform-subdomain-success')).toBeVisible();
  assert.equal(changeWrites,1);report.before=before;
 }
 const after=await rpc('platform_venue_address',{p_venue_id:report.venue_id});
 assert.equal(after.platform_subdomain.label,corrected);assert.equal(after.slug,before.slug);assert.deepEqual(after.venue_state,before.venue_state);assert.deepEqual(after.external_primary,before.external_primary);
 assert(after.aliases.some(a=>a.label===report.stamp+'-address'));
 await page.reload();await expect(panel.locator('.platform-subdomain-current')).toContainText(corrected+'.playerp.dev.bmore.app');
 report.checks.correction={venue_id:report.venue_id,slug:after.slug,from:report.stamp+'-address.playerp.dev.bmore.app',to:after.platform_subdomain.domain,aliases:after.aliases,confirmationNoWrite:true,oneWrite:true,persistedAfterReload:true,venueUnchanged:true,externalPrimaryUnchanged:true};
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'EN',exact:true}).click();
 await expect(panel).toContainText('PlayERP address');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`${out}/detail-mobile-en.png`,fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'ES',exact:true}).click();await page.screenshot({path:`${out}/detail-desktop-es.png`,fullPage:true});
 report.checks.ui={english:true,spanish:true,mobileWidth:390,desktopWidth:1440,noOverflow:true};assert.deepEqual(errors,[]);report.passed=true;await journal();console.log(JSON.stringify({passed:true,venue_id:report.venue_id,report:reportPath}));
} catch(e){report.failure=e.message;await journal();await page.screenshot({path:`${out}/failure.png`,fullPage:true});console.error(e.message);process.exitCode=1;}
finally {await browser.close();}
