// Synthetic fixtures: verifies browser integration, NOT live DEV permissions/email.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
const out=(process.env.SMOKE_OUTPUT_DIR??new URL('../test-results/smoke/',import.meta.url).pathname).replace(/\/?$/, '/');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const records=[],errors=[];
const uid='11111111-1111-4111-8111-111111111111',v1='22222222-2222-4222-8222-222222222222',v2='33333333-3333-4333-8333-333333333333';
const venue={id:v1,name:'Sample Harbor',slug:'sample-harbor',city:'Valencia',state:null,address:'Sample street 1',phone:null,email:null,timezone:'Europe/Madrid',is_active:true};
const venues=[venue,{...venue,id:v2,name:'Sample Garden',slug:'sample-garden',city:'Madrid',is_active:null}];
const user={id:uid,email:'portal-test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T10:00:00Z'};
function session(seconds=3600){const exp=Math.floor(Date.now()/1000)+seconds,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return {access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic-not-valid`,refresh_token:'synthetic-not-valid',expires_in:seconds,expires_at:exp,token_type:'bearer',user};}
async function setup({staff=false,owner=false,auth=false,width=1440,expiry=3600,refreshFail=false,profile=null}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000},locale:'en'}),requests=[];
 await ctx.addInitScript(s=>{if(s&&!sessionStorage.getItem('seeded')){localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));sessionStorage.setItem('seeded','1');}},auth?session(expiry):null);
 await ctx.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push(url.pathname);
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname==='/auth/v1/token')return send(refreshFail?{code:'refresh_token_not_found',message:'Fixture revoked'}:session(),refreshFail?400:200);
  if(url.pathname==='/auth/v1/user')return send(user);
  if(url.pathname==='/rest/v1/staff_profiles'){assert.equal(url.searchParams.get('id'),'eq.'+uid);assert.equal(url.searchParams.get('select'),'first_name,last_name');return profile==='failure'?send({code:'42501'},403):send(profile);}
  if(['/auth/v1/logout','/auth/v1/recover'].includes(url.pathname))return send({});
  if(url.pathname.endsWith('/is_platform_staff'))return send(staff);
  if(url.pathname.endsWith('/portal_access'))return send({is_platform_staff:staff,owner_venues:owner?venues:[]});
  if(url.pathname.endsWith('/portal_owner_venues')){const id=req.postDataJSON().p_venue_id;return owner&&venues.some(v=>v.id===id)?send(venues.filter(v=>v.id===id)):send({code:'42501'},403);}
  if(url.pathname.endsWith('/portal_tenant_directory'))return staff?send(venues):send({code:'42501'},403);
  if(url.pathname.endsWith('/portal_tenant_detail'))return staff?send({venue,print_servers:[
   {id:'44444444-4444-4444-8444-444444444441',venue_id:v1,software_version:'2.4.1',last_seen_at:new Date().toISOString(),status:'active'},
   {id:'44444444-4444-4444-8444-444444444442',venue_id:v1,software_version:'2.3.0',last_seen_at:new Date().toISOString(),status:'revoked'},
   {id:'44444444-4444-4444-8444-444444444443',venue_id:v1,software_version:null,last_seen_at:null,status:'active'},
   {id:'44444444-4444-4444-8444-444444444445',venue_id:v1,software_version:null,last_seen_at:null,status:'pending'},
   {id:'44444444-4444-4444-8444-444444444444',venue_id:v1,software_version:'2.0.0',last_seen_at:'2020-01-01T00:00:00Z',status:'active'}
  ]}):send({code:'42501'},403);
  throw new Error('Unexpected fixture API request '+url.pathname);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));return {ctx,page,requests};
}
const heading=(page,name)=>page.getByRole('heading',{name,exact:true}).waitFor();
const noOverflow=async page=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
const record=name=>{records.push(name);console.log('PASS '+name);};
try{
 for(const width of [1440,834]){
  const {ctx,page,requests}=await setup({width});
  for(const path of ['/','/admin',`/admin/tenants/${v1}`]){await page.goto(origin+path);await heading(page,'Sign in to your workspace');assert.equal(requests.filter(x=>x.includes('/rpc/')).length,0);}
  await noOverflow(page);await page.screenshot({path:out+`login-${width}-en.png`,fullPage:true});
  await page.getByRole('button',{name:'ES',exact:true}).click();await page.reload();await heading(page,'Accede a tu espacio');
  await noOverflow(page);await page.screenshot({path:out+`login-${width}-es.png`,fullPage:true});
  record(`Anonymous direct routes + EN/ES persistence ${width}px`);await ctx.close();
 }
 for(const width of [1440,834]){
  const {ctx,page}=await setup({auth:true,staff:true,width});await page.goto(origin+'/admin');await heading(page,'A clear view across PlayERP.');
  await page.goto(origin+'/admin/tenants');await page.getByPlaceholder('Search by name, slug, or city').fill('Harbor');await page.getByText('Sample Garden',{exact:true}).waitFor({state:'hidden'});
  await page.getByText('Sample Harbor',{exact:true}).click();await heading(page,'Sample Harbor');await page.getByText('Revoked',{exact:true}).waitFor();await page.getByText('Online',{exact:true}).waitFor();await page.getByText('Pending',{exact:true}).waitFor();
  await noOverflow(page);await page.screenshot({path:out+`detail-${width}-en.png`,fullPage:true});
  await page.getByRole('button',{name:'ES',exact:true}).click();await page.getByText('Revocado',{exact:true}).waitFor();await page.getByText('Pendiente',{exact:true}).waitFor();await noOverflow(page);await page.screenshot({path:out+`detail-${width}-es.png`,fullPage:true});
  await page.reload();await heading(page,'Sample Harbor');record(`Admin search/detail/reload and five signal states ${width}px`);await ctx.close();
 }
 {
  const {ctx,page,requests}=await setup({auth:true,owner:true});await page.goto(origin+'/');await heading(page,'Your spaces, in one place.');
  await page.getByLabel('Select a venue',{exact:true}).selectOption(v2);await heading(page,'Sample Garden');await page.reload();await heading(page,'Sample Garden');
  await page.goto(origin+'/?venue=99999999-9999-4999-8999-999999999999');await heading(page,'Access denied');await page.goto(origin+'/admin');await heading(page,'Your spaces, in one place.');
  assert(!requests.some(x=>x.endsWith('portal_tenant_directory')));
  await page.locator('.account-trigger').click();await page.locator('.account-popover').getByRole('button',{name:'Sign out',exact:true}).click();await heading(page,'Sign in to your workspace');
  assert.equal(await page.evaluate(()=>localStorage.getItem('playerp.portal.dev.auth')),null);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('playerp.portal.venue.')).length),0);
  record('Owner selection + foreign venue/admin denial + logout cleanup');await ctx.close();
 }
 {
  const {ctx,page,requests}=await setup({auth:true});await page.goto(origin+'/admin');await heading(page,'Access denied');await page.goto(origin+'/');await heading(page,'Access denied');assert(!requests.some(x=>x.endsWith('portal_tenant_directory')||x.endsWith('portal_owner_venues')));record('No authorized membership fails closed');await ctx.close();
 }
 {
  const {ctx,page}=await setup();await page.goto(origin+'/auth/password#error=access_denied&error_code=otp_expired&error_description=fixture');await page.getByText('This recovery link is invalid or has expired. Request a new one.').waitFor();assert.equal(new URL(page.url()).hash,'');
  await page.getByRole('button',{name:'ES',exact:true}).click();await page.screenshot({path:out+'invalid-link-es.png',fullPage:true});record('Invalid recovery callback clears fragment + translated error');await ctx.close();
 }
 {
  const {ctx,page}=await setup({owner:true});
  await page.goto(origin+'/auth/forgot');await page.getByLabel('Email address',{exact:true}).fill('portal-test@example.invalid');
  const recoveryRequest=page.waitForRequest(r=>new URL(r.url()).pathname==='/auth/v1/recover');
  await page.getByRole('button',{name:'Send recovery email',exact:true}).click();
  const request=await recoveryRequest;assert.equal(new URL(request.url()).searchParams.get('redirect_to'),origin+'/auth/password?recovery=1&lang=en');
  await heading(page,'Check your inbox');
  const s=session();const fragment=new URLSearchParams({access_token:s.access_token,refresh_token:s.refresh_token,expires_in:'3600',token_type:'bearer',type:'recovery'});
  await page.goto(origin+'/auth/password?recovery=1#'+fragment);await heading(page,'Set a new password');
  assert.equal(new URL(page.url()).hash,'');
  await page.getByLabel('New password',{exact:true}).fill('Fixture-only-password-42');await page.getByLabel('Confirm new password',{exact:true}).fill('Fixture-only-password-42');
  await page.getByRole('button',{name:'Save new password',exact:true}).click();await heading(page,'Password updated');
  await page.getByRole('link',{name:'Continue to PlayERP',exact:true}).click();await heading(page,'Your spaces, in one place.');
  record('Recovery request uses own origin; SDK callback/password success returns to owner (no real email)');await ctx.close();
 }
 {
  const {ctx,page}=await setup({auth:true,staff:true});let attempt=0;
  await ctx.route('**/rest/v1/rpc/portal_tenant_detail',async route=>{attempt++;await new Promise(r=>setTimeout(r,500));await route.fulfill({status:attempt===1?500:200,contentType:'application/json',body:JSON.stringify(attempt===1?{message:'Fixture raw backend text must not be shown'}:{venue,print_servers:[]})});});
  await page.goto(origin+'/admin/tenants/'+v1);await heading(page,'Loading your workspace');await heading(page,'Something went wrong');assert.equal(await page.getByText('Fixture raw backend text must not be shown').count(),0);
  await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('No Print Servers are linked to this venue.').waitFor();
  await page.screenshot({path:out+'detail-empty.png',fullPage:true});record('Detail loading/error/retry/empty with safe translated presentation');await ctx.close();
 }
 {
  const {ctx,page}=await setup({auth:true,owner:true});
  await ctx.route('**/auth/v1/logout?*',async route=>{await new Promise(r=>setTimeout(r,1500));await route.fulfill({status:200,contentType:'application/json',body:'{}'}).catch(()=>{});});
  await page.goto(origin+'/');await heading(page,'Your spaces, in one place.');
  await page.locator('.account-trigger').click();await page.locator('.account-popover').getByRole('button',{name:'Sign out',exact:true}).click();
  await page.reload();await heading(page,'Sign in to your workspace');assert.equal(await page.evaluate(()=>localStorage.getItem('playerp.portal.dev.auth')),null);
  record('Reload during slow logout cannot restore discarded credentials');await ctx.close();
 }
 {
  const {ctx,page}=await setup({owner:true});
  await page.goto(origin+'/auth/password#error=access_denied&error_code=otp_expired');
  await page.getByRole('link',{name:'Forgot password?',exact:true}).click();await page.getByRole('link',{name:'Back to sign in',exact:true}).click();
  await page.getByLabel('Email address',{exact:true}).fill('portal-test@example.invalid');await page.getByLabel('Password',{exact:true}).fill('Fixture-only-password-42');await page.getByRole('button',{name:'Sign in',exact:true}).click();await heading(page,'Your spaces, in one place.');
  await page.locator('.account-trigger').click();await page.locator('.account-popover').getByRole('link',{name:'Change password',exact:true}).click();await heading(page,'Set a new password');
  await page.getByLabel('New password',{exact:true}).fill('Fixture-only-password-43');await page.getByLabel('Confirm new password',{exact:true}).fill('Fixture-only-password-43');await page.getByRole('button',{name:'Save new password',exact:true}).click();await heading(page,'Password updated');
  record('Invalid callback does not poison password change after a new login');await ctx.close();
 }
 for(const refreshFail of [false,true]){
  const {ctx,page,requests}=await setup({auth:true,owner:true,expiry:5,refreshFail});await page.goto(origin+'/');await heading(page,refreshFail?'Sign in to your workspace':'Your spaces, in one place.');assert(requests.some(x=>x==='/auth/v1/token'));record(refreshFail?'Rejected refresh returns to login':'Valid refresh retains route');await ctx.close();
 }
 {
  const {ctx,page}=await setup({auth:true,staff:true,profile:{first_name:'  Nora ',last_name:' Prueba '}});
  await page.goto(origin+'/admin');await heading(page,'A clear view across PlayERP.');
  await page.getByRole('button',{name:'Account menu: Nora Prueba',exact:true}).waitFor();
  await page.locator('.account-trigger').click();assert.equal(await page.locator('.account-popover-header strong').textContent(),user.email);await page.keyboard.press('Escape');
  await page.evaluate(()=>document.querySelector('.portal-layout').dataset.acceptance='persistent');
  await page.locator('.sidebar-nav a[href="/admin/tenants"]').click();await heading(page,'Tenant directory');
  assert.equal(await page.locator('.portal-layout').getAttribute('data-acceptance'),'persistent');
  await page.locator('.breadcrumbs a[href="/admin"]').click();await heading(page,'A clear view across PlayERP.');
  assert.equal(await page.locator('.portal-layout').getAttribute('data-acceptance'),'persistent');
  await page.locator('.account-trigger').click();await page.locator('.account-popover').getByRole('link',{name:'Change password',exact:true}).click();await heading(page,'Set a new password');
  assert.equal(await page.locator('.portal-layout').getAttribute('data-acceptance'),'persistent');
  assert.equal(await page.locator('.sidebar-nav a,.topbar-subnav a,.breadcrumbs a').count(),0);
  assert.equal(await page.locator('main').count(),1);
  record('Persistent shell across list, breadcrumb and authenticated password; own profile first/last name');await ctx.close();
 }
 {
  const {ctx,page,requests}=await setup({auth:true,staff:true});
  let release;const held=new Promise(resolve=>{release=resolve;});
  await ctx.route('**/rest/v1/rpc/portal_access',async route=>{await held;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({is_platform_staff:true,owner_venues:[]})});});
  await page.goto(origin+'/admin');await heading(page,'Loading your workspace');
  assert.equal(await page.locator('.portal-layout main .state-loading').count(),1);
  assert.equal(await page.locator('.sidebar-nav a,.topbar-subnav a,.breadcrumbs a').count(),0);
  assert(!requests.some(x=>x.includes('/staff_profiles')||x.includes('/portal_tenant_directory')));
  release();await heading(page,'A clear view across PlayERP.');
  record('Pending authorization keeps a central loading state without profile or business reads');await ctx.close();
 }
 for(const profile of [null,{first_name:' ',last_name:null},'failure']){
  const {ctx,page}=await setup({auth:true,owner:true,profile});await page.goto(origin+'/');await heading(page,'Your spaces, in one place.');
  assert.equal(await page.locator('.account-trigger-name').textContent(),user.email);
  record('Missing/blank/failed profile renders full email without profile writes');await ctx.close();
 }
 for(const state of ['recovery','invitation']){
  const {ctx,page,requests}=await setup({auth:true,staff:true});
  await ctx.addInitScript(key=>sessionStorage.setItem('playerp.portal.'+key,'1'),state);
  await page.goto(origin+'/admin/users');await heading(page,state==='invitation'?'Create your staff password':'Set a new password');
  assert.equal(await page.locator('.portal-layout main').count(),1);
  assert.equal(await page.locator('.sidebar-nav a,.topbar-subnav a,.breadcrumbs a').count(),0);
  assert(!requests.some(x=>x.includes('/rpc/')||x.includes('/functions/')||x.includes('/staff_profiles')));
  await page.locator('.account-trigger').click();assert.equal(await page.locator('.account-popover a').count(),0);
  record(state+' session keeps central form, no area navigation or protected requests');await ctx.close();
 }
 {
  const {ctx,page,requests}=await setup({auth:true,staff:true});
  await ctx.route('**/rest/v1/rpc/portal_access',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({is_platform_staff:false,platform_role:'support',owner_venues:[]})}));
  for(const path of ['/admin/users/'+uid,'/admin/print-servers/'+v1,'/admin/tenants/'+v1]){
   await page.goto(origin+path);await heading(page,'Access denied');
   assert.equal(await page.locator('.portal-layout main .state-denied').count(),1);
   assert.equal(await page.locator('a[href="/admin/users"],a[href="/admin/print-servers"],a[href="/admin/tenants"]').count(),0);
  }
  assert(!requests.some(x=>x.includes('/functions/')||/portal_tenant_|portal_ps_|ps_panel/.test(x)));
  record('Support deep links denied centrally without unauthorized breadcrumbs or scoped data requests');await ctx.close();
 }
 {
  const {ctx,page}=await setup({auth:true,staff:true,width:390});
  await ctx.route('**/functions/v1/platform-staff-admin',route=>{
   const action=route.request().postDataJSON()?.action;
   return route.fulfill({status:action==='list'?200:500,contentType:'application/json',body:JSON.stringify(action==='list'?{members:[{user_id:v1,email:'fixture@example.invalid',full_name:'Fixture member',role:'support',status:'active',active:true}]}:{error:'synthetic_failure'})});
  });
  await page.goto(origin+'/admin/staff');await page.locator('.staff-table tbody tr').waitFor();
  await page.locator('.staff-action-link.danger').click();await page.getByRole('alertdialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('alert').waitFor();
  assert(await page.getByRole('alertdialog').getByRole('button',{name:'Cancel',exact:true}).isEnabled());
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor({state:'detached'});
  record('Failed staff confirmation remains open with accessible error and cancel (synthetic only)');await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'browser-smoke.json',JSON.stringify({origin,fixtureOnly:true,records,pageErrors:errors},null,2));
 console.log(JSON.stringify({passed:records.length,fixtureOnly:true}));
}finally{await browser.close();}
