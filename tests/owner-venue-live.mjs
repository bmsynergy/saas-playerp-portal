// PE-336: real DEV sessions, real backend responses and UI. No intercepted APIs.
// Only a tagged test member's role and a simulated printer label are changed,
// then restored in finally. No email or physical printer command is sent.
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const config=await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');
const key=config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const A='c1700000-0000-0000-0000-0000000000a0', B='7c0f986f-2f28-4238-9080-279be48a0cc1';
const out=process.env.SMOKE_OUTPUT_DIR??'test-results/owner-venue-live';await mkdir(out,{recursive:true});
const report={origin,mocks:false,checks:[],pageErrors:[],screenshots:[]};
const record=(name,details={})=>{report.checks.push({name,...details});console.log('PASS '+name);};
const sessions=[];
async function request(path,token,body){
 const r=await fetch(api+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body??{})});
 return {status:r.status,data:await r.json().catch(()=>null)};
}
const rpc=(name,token,body)=>request('/rest/v1/rpc/'+name,token,body);
const edge=(token,body)=>request('/functions/v1/owner-venue-users',token,body);
async function session(profile){const c=accounts[profile];assert(c.email.endsWith('@resend.dev'));const r=await request('/auth/v1/token?grant_type=password',null,{email:c.email,password:c.password});assert.equal(r.status,200,`login ${profile}`);sessions.push(r.data.access_token);return r.data;}
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
async function setup(profile,width=390,locale='en'){
 const s=await session(profile),ctx=await browser.newContext({viewport:{width,height:900},locale});
 await ctx.addInitScript(({s,locale})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.portal.locale',locale);},{s,locale});
 const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',()=>report.pageErrors.push('Browser runtime error'));
 const calls=[];page.on('request',r=>{if(r.url().startsWith(api+'/rest/v1/rpc/')||r.url().startsWith(api+'/functions/v1/')) calls.push({name:new URL(r.url()).pathname.split('/').pop(),body:r.postDataJSON()});});
 return {ctx,page,token:s.access_token,calls};
}
async function fits(page,label){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`horizontal overflow: ${label}`);}
async function shot(page,name){await fits(page,name);await page.screenshot({path:`${out}/${name}.png`,fullPage:true});report.screenshots.push(name+'.png');}
async function ps(page){await page.getByTestId('venue-print-servers-tab').click();await expect(page.getByTestId('ps-detail')).toBeVisible();}
const forbidden=new Set(['portal_ps_fleet','portal_ps_inventory','portal_tenant_directory','portal_tenant_detail','platform_venue_users_list','platform-identity-admin','platform-staff-admin']);
try{
 for(const locale of ['en','es']){
  const {ctx,page,token,calls}=await setup('owner_uno',390,locale);
  const state=(await rpc('ps_panel_state',token,{p_venue_id:A})).data;assert(state.print_server&&state.printers.length>0);const first=state.printers[0];
  await page.goto(origin+`/?venue=${A}`);await expect(page.getByTestId('venue-users-tab')).toBeVisible();
  await fits(page,`owner details ${locale}`);
  await page.getByTestId('venue-users-tab').click();await expect(page.getByTestId('owner-user-row').first()).toBeVisible();
  const users=(await edge(token,{action:'list',venue_id:A})).data;
  await expect(page.getByTestId('owner-user-row')).toHaveCount(users.users.length);
  await page.getByTestId('venue-users-search').fill('no-user-at-this-venue');await expect(page.getByTestId('venue-users-no-results')).toBeVisible();
  await page.getByTestId('venue-users-search').fill(users.users[0].email);await expect(page.getByTestId('owner-user-row')).toHaveCount(1);
  await page.getByTestId('venue-users-search').fill('');
  await page.getByTestId('owner-users-invite').click();await expect(page.getByTestId('owner-invite-dialog')).toBeVisible();await fits(page,'owner invite');
  await page.getByTestId('owner-invite-dialog').getByRole('button',{name:locale==='es'?'Cancelar':'Cancel',exact:true}).click();
  await shot(page,`owner-users-390-${locale}`);
  await ps(page);await expect(page.getByTestId('ps-version')).toHaveText(state.print_server.software_version);
  await expect(page.getByTestId('ps-assign')).toHaveCount(0);await expect(page.getByTestId('ps-revoke')).toHaveCount(0);await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  await expect(page.getByTestId('printers-toggle')).toHaveAttribute('aria-expanded','false');
  for(const printer of state.printers)await expect(page.getByTestId(`queue-toggle-${printer.id}`)).toHaveAttribute('aria-expanded','false');
  await page.getByTestId('printers-toggle').click();
  await expect(page.getByTestId(`printer-row-${first.id}`)).toBeVisible();
  await page.getByTestId('printers-search').fill('unmatched-foreign-device');await expect(page.getByTestId('printers-no-results')).toBeVisible();
  await page.getByTestId('printers-search').fill(first.label);await expect(page.getByTestId(`printer-row-${first.id}`)).toBeVisible();
  await page.getByTestId('printers-search').fill('');
  const jobs=(await rpc('ps_panel_printer_jobs',token,{p_venue_id:A,p_printer_id:first.id,p_limit:10,p_offset:0})).data;
  await page.getByTestId(`queue-toggle-${first.id}`).click();
  for(const job of jobs.jobs)await expect(page.getByTestId(`job-row-${job.id}`)).toBeVisible();
  await shot(page,`owner-ps-390-${locale}`);
  assert(!calls.some(c=>forbidden.has(c.name)),'owner called platform API');
  assert(calls.filter(c=>c.body?.p_venue_id).every(c=>c.body.p_venue_id===A),'owner read another venue');
  record(`${locale}: real owner details/users/PS/version/printers/queues; local search; collapsed initial state; mobile fits; no reserved controls or global reads`,{users:users.users.length,printers:state.printers.length,jobs:jobs.jobs.length});
  // Actual server isolation, even when a request bypasses the UI.
  if(locale==='en'){
   for(const name of ['ps_panel_state','portal_owner_venues'])assert.equal((await rpc(name,token,{p_venue_id:B})).status,403,name+' foreign venue');
   for(const name of ['portal_ps_fleet','portal_ps_inventory','portal_tenant_directory'])assert.equal((await rpc(name,token,{})).status,403,name+' global');
   const cross=await rpc('ps_panel_printer_jobs',token,{p_venue_id:B,p_printer_id:first.id,p_limit:10,p_offset:0});assert.equal(cross.status,403);
   record('Real owner session denied foreign venue and global reads (403)');
   const target=users.users.find(u=>u.email==='delivered+pe328-solo-a@resend.dev');assert(target&&!target.locked,'controlled user fixture');
   const next=target.role==='events_staff'?'front_desk':'events_staff';
   await page.getByTestId('venue-users-tab').click();
   const row=page.getByTestId('owner-user-row').filter({hasText:target.email});
   try{
    await row.locator('select').selectOption(next);await expect(page.getByTestId('owner-user-confirm')).toBeVisible();
    await page.getByTestId('owner-user-confirm').getByRole('button',{name:'Confirm',exact:true}).click();
    await expect(row.locator('select')).toHaveValue(next);
    assert.equal((await edge(token,{action:'list',venue_id:A})).data.users.find(u=>u.user_id===target.user_id).role,next);
    record('Existing owner user management: role changed through confirmation UI and verified on server');
   }finally{assert.equal((await edge(token,{venue_id:A,action:'set_role',user_id:target.user_id,role:target.role})).status,200);}
   assert.equal((await edge(token,{venue_id:A,action:'set_role',user_id:target.user_id,role:'owner'})).status,422);
   assert.equal((await edge(token,{venue_id:B,action:'list'})).status,403);
   record('Owner cannot assign owner role (422) or manage foreign venue users (403); original role restored');
   const member=users.users.find(u=>u.user_id===accounts.venue_frontdesk.user_id);assert(member&&!member.locked,'front desk fixture');
   const memberRow=page.getByTestId('owner-user-row').filter({hasText:member.email});
   try{
    if(!member.portal_access){await memberRow.getByTestId('owner-user-portal-toggle').click();await page.getByTestId('owner-user-confirm').getByRole('button',{name:'Confirm',exact:true}).click();await expect(memberRow.getByTestId('owner-user-portal-toggle')).toHaveText('Remove portal access');}
    assert.equal((await edge(token,{action:'list',venue_id:A})).data.users.find(u=>u.user_id===member.user_id).portal_access,true);
    const reader=await setup('venue_frontdesk',390);try{
     await reader.page.goto(origin+`/?venue=${A}`);await expect(reader.page.getByTestId('venue-print-servers-tab')).toBeVisible();await expect(reader.page.getByTestId('venue-users-tab')).toHaveCount(0);
     await ps(reader.page);await expect(reader.page.getByTestId('ps-read-only')).toBeVisible();await reader.page.getByTestId('printers-toggle').click();await expect(reader.page.getByTestId('printer-add')).toHaveCount(0);await expect(reader.page.getByTestId('ps-scan')).toHaveCount(0);
     assert.equal((await rpc('ps_panel_update_printer',reader.token,{p_printer_id:first.id,p_label:'Denied test'})).status,403);
     record('Owner portal-access UI grants controlled member access; real member sees PS read-only, no Users tab, and server denies printer operation (403)');
    }finally{await reader.ctx.close();}
   }finally{assert.equal((await edge(token,{venue_id:A,action:'set_portal_access',user_id:member.user_id,portal_access:member.portal_access})).status,200);}

  }
  await ctx.close();
 }
 const multi=await setup('owner_varios',1440);await multi.page.goto(origin+`/?venue=${A}`);await ps(multi.page);
 await multi.page.getByTestId('printers-toggle').click();await multi.page.getByTestId('printers-search').fill('old-context-filter');
 await multi.page.getByLabel('Select a venue',{exact:true}).selectOption(B);
 await expect(multi.page.getByTestId('ps-detail')).toHaveCount(0);await ps(multi.page);
 await expect(multi.page.getByTestId('printers-toggle')).toHaveAttribute('aria-expanded','false');await multi.page.getByTestId('printers-toggle').click();await expect(multi.page.getByTestId('printers-search')).toHaveValue('');
 const stateB=(await rpc('ps_panel_state',multi.token,{p_venue_id:B})).data;
 await expect(multi.page.getByTestId(`printer-row-${stateB.printers[0].id}`)).toBeVisible();
 await expect(multi.page.getByTestId('ps-detail')).not.toContainText('PE-336 PS simulado A');
 assert(!multi.calls.some(c=>forbidden.has(c.name)));
 await shot(multi.page,'owner-switch-1440-en');record('Real multi-venue owner switches A to B: resets tab, filter, expansion and displayed data; no global reads');await multi.ctx.close();
 for(const locale of ['en','es']){
  const admin=await setup('staff_activo',390,locale);await admin.page.goto(origin+`/admin/tenants/${A}/print-servers/detail`);await expect(admin.page.getByTestId('ps-detail')).toBeVisible();
  const state=(await rpc('ps_panel_state',admin.token,{p_venue_id:A})).data;
  await expect(admin.page.getByTestId('ps-version')).toHaveText(state.print_server.software_version);await expect(admin.page.getByTestId('ps-assign')).toBeVisible();
  await expect(admin.page.getByTestId('printers-toggle')).toHaveAttribute('aria-expanded','false');await admin.page.getByTestId('printers-toggle').click();
  await expect(admin.page.locator('[data-testid^="printer-row-"]')).toHaveCount(state.printers.length);
  await admin.page.getByTestId(`queue-toggle-${state.printers[0].id}`).click();await shot(admin.page,`admin-ps-390-${locale}`);
  await admin.page.getByTestId('venue-users-tab').click();await expect(admin.page.getByTestId('venue-user-row').first()).toBeVisible();await expect(admin.page.getByTestId('venue-users-tab')).toHaveClass(/active/);await fits(admin.page,'admin users');
  record(`${locale}: Admin uses same real PS/printer/queue component with platform actions and existing Users tab, mobile fits`);await admin.ctx.close();
 }
 assert.deepEqual(report.pageErrors,[]);report.passed=true;
}finally{
 await browser.close();for(const token of sessions)await request('/auth/v1/logout?scope=local',token,{}).catch(()=>{});
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
}
