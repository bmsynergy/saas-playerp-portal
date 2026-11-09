// Presentation acceptance against DEV or a test port. All Auth/API traffic is
// intercepted; this never modifies accounts, permissions, tickets or backend data.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import ts from 'typescript';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out=process.env.I18N_OUTPUT_DIR??'test-results/i18n';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const dictionaries={};for(const locale of ['en','es']){const exports={};new Function('exports',ts.transpileModule(await readFile(new URL(`../src/locales/${locale}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);dictionaries[locale]=exports[locale];}
const U='11111111-1111-4111-8111-111111111111', V='22222222-2222-4222-8222-222222222222', T='33333333-3333-4333-8333-333333333333';
const when='2026-10-02T17:45:00Z';
const user={id:U,email:'i18n@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:when};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256'})}.${enc({sub:U,exp,aud:'authenticated',role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const venue={id:V,name:'Harbor Demo',slug:'harbor-demo',city:'San Juan',state:'PR',address:'123 Demo',phone:null,email:null,timezone:'America/Puerto_Rico',is_active:true,is_owner:true};
const ticket={id:T,venue_id:V,venue_name:venue.name,subject:'Printer fixture case',category:'hardware',priority:'high',status:'in_progress',created_by:U,created_by_name:'Alex Demo',created_at:when,updated_at:when,last_message_at:when,last_message_scope:'tenant',age_hours:12345,message_count:12345,unread:true,pending:true,assigned_to:U,assigned_name:'Alex Demo',can_reply:true,allowed_statuses:['open','in_progress','waiting_tenant','resolved','closed']};
const report={origin,backend:'Synthetic intercepted Auth/API responses; real deployed frontend when origin is DEV. No live permission or backend mutation claims.',checks:[],screenshots:[],errors:[],unexpected:[]};
const record=text=>{report.checks.push(text);console.log('PASS '+text);};
async function setup(width,role='mixed'){
 const context=await browser.newContext({viewport:{width,height:950},locale:'en-US',timezoneId:'UTC',serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!sessionStorage.getItem('i18n-seeded')){localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','en');sessionStorage.setItem('i18n-seeded','yes');}},session);
 const state={mode:'ready',replyFail:false};
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
  if(url.origin===origin&&['GET','HEAD'].includes(req.method()))return route.continue();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send({first_name:'Alex',last_name:'Demo'});
  if(name==='is_platform_staff')return send(role!=='owner');
  if(name==='portal_access')return send({is_platform_staff:role==='mixed',platform_role:role==='owner'?null:role==='support'?'support':'super_admin',support_staff:role!=='owner',owner_venues:role==='support'?[]:[venue]});
  if(name==='portal_owner_venues')return send([venue]);
  if(name==='portal_tenant_directory')return send([venue]);
  if(name==='portal_tenant_readiness_list')return send({items:[{venue_id:V,venue_name:venue.name,venue_slug:venue.slug,lifecycle:'active'}],total:1,page:1,page_size:25,pages:1,summary:{active:1}});
  if(name==='support_venue_counts')return send({totals:{active:12345,pending:1234,unread:1},venues:[{venue_id:V,venue_name:venue.name,active:12345,pending:1234,unread:1}]});
  if(name==='support_assignable_staff')return send([{user_id:U,name:'Alex Demo',email:user.email,role:'super_admin'}]);
  if(name==='support_ticket_list'){
   if(state.mode==='error')return send({code:'XX000',message:'UNTRANSLATED_BACKEND_SENTINEL'},500);
   const p=req.postDataJSON();return send({scope:p.p_scope,total:state.mode==='empty'?0:1,pages:1,page:1,page_size:25,items:state.mode==='empty'?[]:[ticket],summary:{active:1,pending:1,unread:1}});
  }
  if(name==='support_ticket_detail'){const p=req.postDataJSON();return send({scope:p.p_scope,ticket,messages:[{id:'message-1',author_name:'Alex Demo',author_scope:'tenant',body:'User content remains unchanged.',created_at:when,unread:false,is_internal:false}]});}
  if(name==='reply-support-ticket')return state.replyFail?send({error:'untranslated_error'},500):send({email_sent:true});
  if(name==='platform-staff-admin')return send({members:[{user_id:U,email:user.email,full_name:'Alex Demo',role:'super_admin',status:'active',active:true,is_self:true,created_at:when,last_sign_in_at:when},{user_id:T,email:'staff@example.invalid',full_name:'Sam Demo',role:'support',status:'invited',active:true,is_self:false,created_at:when,invited_at:when}]});
  report.unexpected.push(name);return send({code:'unexpected_fixture_call'},500);
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));return {context,page,state};
}
async function language(page,lang){
 const marker=await page.evaluate(()=>window.__i18nDocumentMarker??(window.__i18nDocumentMarker=Math.random()));
 await page.getByRole('button',{name:lang.toUpperCase(),exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('lang',lang);
 assert.equal(await page.evaluate(()=>window.__i18nDocumentMarker),marker,'language toggle must not reload');
 assert.equal(await page.evaluate(()=>localStorage.getItem('playerp.locale')),lang);
}
async function capture(page,name){
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal viewport overflow '+name);
 const body=await page.locator('body').innerText();
 assert(!body.includes('UNTRANSLATED_BACKEND_SENTINEL'));
 const visibleKeys=Object.keys(dictionaries.en).filter(key=>key.includes('.')&&body.split(/\s+/).includes(key));
 assert.deepEqual(visibleKeys,[],'visible translation keys');
 const file=`${name}.png`;await page.screenshot({path:`${out}/${file}`,fullPage:true});report.screenshots.push(file);
}
async function switchScope(page,scope,lang){await page.locator('.account-trigger').click();await page.locator('.account-popover').getByRole('link',{name:dictionaries[lang][scope==='owner'?'switchOwner':'switchAdmin'],exact:true}).click();}
try {
 for(const width of [1440,390]){
  const {context,page,state}=await setup(width);
  await page.goto(origin+'/admin?lang=en');await expect(page.getByRole('heading',{name:dictionaries.en.adminWelcome,exact:true})).toBeVisible();
  await capture(page,`admin-home-${width}-en`);
  await language(page,'es');assert.equal(new URL(page.url()).searchParams.get('lang'),'es');
  await expect(page.getByRole('heading',{name:dictionaries.es.adminWelcome,exact:true})).toBeVisible();
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','es');
  if(width===390){await page.locator('.mobile-nav-button').click();await expect(page.locator('#portal-sidebar-links')).toContainText('Soporte');await expect(page.locator('#portal-sidebar-links')).toContainText('Personal');await capture(page,`admin-navigation-${width}-es`);await page.locator('.sidebar-close').click();}
  else {await page.locator('.sidebar-collapse').click();await expect(page.locator('.sidebar a[href="/admin/support"]')).toHaveAttribute('title','Soporte');await page.locator('.sidebar-collapse').click();}
  await capture(page,`admin-home-${width}-es`);record(`Admin EN→ES without reload; explicit lang URL, reload, ${width}px navigation`);
  await page.goto(origin+'/admin/staff');await expect(page.getByRole('heading',{name:dictionaries.es['staff.title'],exact:true})).toBeVisible();
  const staffDate=new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(when));await expect(page.locator('main')).toContainText(staffDate);
  await page.getByRole('button',{name:dictionaries.es['staff.cancelInvite'],exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText(dictionaries.es['staff.confirmCancelInvite']);await page.getByRole('alertdialog').getByRole('button',{name:dictionaries.es['staff.cancel'],exact:true}).click();
  await capture(page,`staff-${width}-es`);await language(page,'en');await expect(page.getByRole('heading',{name:dictionaries.en['staff.title'],exact:true})).toBeVisible();
  await expect(page.locator('main')).toContainText(new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(when)));
  await page.getByRole('button',{name:dictionaries.en['staff.cancelInvite'],exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText(dictionaries.en['staff.confirmCancelInvite']);await page.getByRole('alertdialog').getByRole('button',{name:dictionaries.en['staff.cancel'],exact:true}).click();
  await capture(page,`staff-${width}-en`);record(`Staff full EN/ES, confirmation dialogs and date formatting ${width}px`);
  await page.goto(origin+'/admin/support');await expect(page.getByTestId(`support-ticket-${T}`)).toBeVisible();await capture(page,`admin-support-${width}-en`);
  await language(page,'es');await expect(page.getByRole('heading',{name:'Soporte',exact:true})).toBeVisible();await page.getByTestId(`support-ticket-${T}`).click();await expect(page.getByTestId('support-thread')).toContainText('User content remains unchanged.');
  await capture(page,`admin-support-thread-${width}-es`);
  // Failed reply is fully intercepted. Keep the message visible while toggling language.
  state.replyFail=true;await page.getByTestId('support-reply-body').fill('Synthetic reply only');await page.getByTestId('support-send').click();await expect(page.locator('main')).toContainText(dictionaries.es.genericError);
  await language(page,'en');await expect(page.locator('main')).toContainText(dictionaries.en.genericError);state.replyFail=false;
  await page.getByTestId('support-send').click();await expect(page.locator('main')).toContainText(dictionaries.en['support.saved']);await language(page,'es');await expect(page.locator('main')).toContainText(dictionaries.es['support.saved']);
  record(`Support thread, user data preserved, error and success retranslate ${width}px`);
  await switchScope(page,'owner','es');await expect(page.getByRole('heading',{name:dictionaries.es.ownerWelcome,exact:true})).toBeVisible();
  await expect(page.locator('main')).toContainText(new Intl.NumberFormat('es-ES').format(12345));await capture(page,`owner-home-${width}-es`);
  await language(page,'en');await expect(page.locator('main')).toContainText(new Intl.NumberFormat('en-US').format(12345));await capture(page,`owner-home-${width}-en`);
  await page.goto(origin+'/?section=support');await expect(page.getByTestId('support-page')).toHaveAttribute('data-support-scope','venue');await capture(page,`owner-support-${width}-en`);
  await language(page,'es');await expect(page.getByRole('heading',{name:'Soporte',exact:true})).toBeVisible();await capture(page,`owner-support-${width}-es`);
  await page.reload();await expect(page.getByRole('heading',{name:'Soporte',exact:true})).toBeVisible();await switchScope(page,'admin','es');await expect(page.locator('html')).toHaveAttribute('lang','es');
  record(`Owner EN/ES, locale numbers, navigation/reload and owner↔admin persistence ${width}px`);
  state.mode='empty';await page.goto(origin+'/admin/support');await expect(page.getByText('Todavía no hay casos de soporte.',{exact:true})).toBeVisible();await language(page,'en');await expect(page.getByText('There are no support cases yet.',{exact:true})).toBeVisible();
  state.mode='error';await page.reload();await expect(page.locator('main')).toContainText(dictionaries.en.genericError);await language(page,'es');await expect(page.locator('main')).toContainText(dictionaries.es.genericError);await capture(page,`support-error-${width}-es`);
  record(`Support empty/error states retranslate ${width}px`);await context.close();
 }
 const {context,page}=await setup(390,'support');await page.goto(origin+'/admin/support');await expect(page.getByTestId('support-page')).toBeVisible();await language(page,'es');await expect(page.getByRole('heading',{name:'Soporte',exact:true})).toBeVisible();record('Support-only role retains translated access');await context.close();
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);report.passed=true;
} catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;}
finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
