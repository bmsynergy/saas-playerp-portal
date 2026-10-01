// Opt-in DEV acceptance. Creates only tagged temporary test identities and removes
// them in finally. No session, password, email token or privileged key is written.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const pat=process.env.SUPABASE_ACCESS_TOKEN; assert(pat,'SUPABASE_ACCESS_TOKEN required');
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co', mgmt='https://api.supabase.com/v1/projects/fzwzmwstxlsxdzdmphyq';
const tag=`pe322ui-${Date.now()}`, password=`Pe322!${randomBytes(20).toString('hex')}`;
const out=process.env.PE322_OUTPUT??'test-results/pe322';await mkdir(out,{recursive:true});
const report={origin,project:'fzwzmwstxlsxdzdmphyq',startedAt:new Date().toISOString(),mocks:false,checks:[],screenshots:[],pageErrors:[]};
const credentials={},ids=[],sessions=[];let browser,anon,service;
async function http(url,body,token,method='POST',key=anon) {
 const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(key?{apikey:key}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}return {status:r.status,data};
}
const admin=(path,body,method='POST')=>http(api+path,body,service,method,service);
async function sql(query){const r=await http(mgmt+'/database/query',{query},pat,'POST',null);if(r.status!==201)throw new Error('DEV query '+r.status+': '+String(r.data?.message??r.data?.error??'failed'));return r.data;}
function ok(name,extra={}){report.checks.push({name,passed:true,...extra});console.log('PASS '+name);}
const rpc=(name,token,body={})=>http(api+'/rest/v1/rpc/'+name,body,token);
const edge=(token,body)=>http(api+'/functions/v1/platform-staff-admin',body,token);
async function make(profile,metadata={full_name:`QA ${profile}`}) {
 const email=`delivered+${tag}-${profile}@resend.dev`;
 const r=await admin('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:metadata,app_metadata:{pe322_ui_test:tag}});
 assert([200,201].includes(r.status),'create temporary user');ids.push(r.data.id);
 const c={id:r.data.id,email,password};credentials[profile]=c;return c;
}
async function member(c,role='super_admin',active=true){const r=await admin('/rest/v1/platform_staff_members',{user_id:c.id,role,active,invited_at:new Date().toISOString(),accepted_at:new Date().toISOString()});assert.equal(r.status,201,'create test membership');}
async function owner(c,venue){
 await sql(`insert into public.staff_roles(user_id,role) values ('${c.id}','owner')`);
 await sql(`insert into public.staff_venue_assignments(user_id,venue_id) values ('${c.id}','${venue}')`);
}
async function loginApi(c){const r=await http(api+'/auth/v1/token?grant_type=password',{email:c.email,password:c.password});assert.equal(r.status,200,'test login');sessions.push(r.data.access_token);return r.data;}
async function ctx(width=1440,locale='en') {
 const context=await browser.newContext({viewport:{width,height:1000},locale});
 const page=await context.newPage();page.setDefaultTimeout(20_000);
 page.on('pageerror',()=>report.pageErrors.push('Browser runtime error'));
 const calls=[];page.on('request',r=>{if(r.url().startsWith(api))calls.push(new URL(r.url()).pathname);});
 // Record whether the wrong scope was ever rendered, including transient frames.
 await context.addInitScript(()=>{
  window.__scopes=[];new MutationObserver(()=>{const text=document.querySelector('.topbar-context')?.textContent;if(text&&!window.__scopes.includes(text))window.__scopes.push(text);}).observe(document,{childList:true,subtree:true});
 });
 return {context,page,calls};
}
const heading=(page,name)=>page.getByRole('heading',{name,exact:true}).waitFor();
async function loginUi(page,c,path='/'){
 await page.goto(origin+path);await heading(page,'Sign in to your workspace');
 await page.getByLabel('Email address',{exact:true}).fill(c.email);await page.getByLabel('Password',{exact:true}).fill(c.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
}
async function snapshot(page,name){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${name}`);await page.screenshot({path:`${out}/${name}.png`,fullPage:true});report.screenshots.push(name+'.png');}
async function accountMenu(page){await page.locator('.account-trigger').click();}
async function logout(page,locale='en'){
 await accountMenu(page);await page.getByRole('menuitem',{name:locale==='es'?'Cerrar sesión':'Sign out',exact:true}).click();
 await heading(page,locale==='es'?'Accede a tu espacio':'Sign in to your workspace');
 assert.equal(await page.evaluate(()=>localStorage.getItem('playerp.portal.dev.auth')),null);
 assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('playerp.portal.scope.')).length),0);
}
async function verifyLink(id,type,locale='es'){
 const token=(await sql(`select ${type==='invite'?'confirmation_token':'recovery_token'} as token from auth.users where id='${id}'`))[0]?.token;assert(token,'Auth issued token');
 const redirect=`https://playerp.dev.bmore.app/auth/password?${type==='invite'?'invite':'recovery'}=1&lang=${locale}`;
 const link=`${api}/auth/v1/verify?token=${encodeURIComponent(token)}&type=${type}&redirect_to=${encodeURIComponent(redirect)}`;
 const response=await fetch(link,{redirect:'manual'});assert.equal(response.status,303);
 const location=new URL(response.headers.get('location'));assert.equal(location.origin,'https://playerp.dev.bmore.app');assert.equal(location.search,new URL(redirect).search);
 const fragment=new URLSearchParams(location.hash.slice(1));assert.equal(fragment.get('type'),type);assert(fragment.get('access_token'));sessions.push(fragment.get('access_token'));
 return {url:origin+location.pathname+location.search+location.hash,link};
}
async function changePassword(page,newPassword,invite=false){
 await heading(page,invite?'Crea tu contraseña de staff':'Crea una contraseña nueva');
 await page.getByLabel('Contraseña nueva',{exact:true}).fill(newPassword);
 await page.getByLabel('Confirmar contraseña nueva',{exact:true}).fill(newPassword);
 await page.getByRole('button',{name:'Guardar contraseña nueva',exact:true}).click();
 await heading(page,invite?'Tu cuenta está lista':'Contraseña actualizada');
 await page.getByRole('link',{name:'Continuar a PlayERP',exact:true}).click();
}
function waitAction(page,action){return page.waitForResponse(r=>r.url().endsWith('/functions/v1/platform-staff-admin')&&r.request().postDataJSON()?.action===action);}
async function staffAction(page,email,action,value){
 const row=page.getByRole('row').filter({hasText:email});
 if(action==='set_role')await row.getByRole('combobox').selectOption(value);
 else await row.getByRole('button',{name:value==='active'?'Reactivate':action==='send_recovery'?'Send recovery':value==='cancel'?'Cancel invitation':'Revoke access',exact:true}).click();
 const pending=waitAction(page,action);await row.getByRole('button',{name:'Confirm',exact:true}).click();
 const r=await pending;assert.equal(r.status(),200,`UI ${action}`);const data=await r.json();
 await row.getByRole('button',{name:'Confirm',exact:true}).waitFor({state:'hidden'});return data;
}
try {
 const keys=await http(mgmt+'/api-keys?reveal=true',undefined,pat,'GET',null);assert.equal(keys.status,200,'DEV keys');
 anon=keys.data.find(k=>k.name==='anon').api_key;service=keys.data.find(k=>k.name==='service_role').api_key;
 const before=await sql('select count(*)::int as count from public.platform_staff_members');report.initialRosterCount=before[0].count;
 const venue=(await sql("select id,name from public.venues where slug='wi170p1-venue'"))[0];assert(venue);
 const a=await make('admin');await member(a);
 const o=await make('owner',{});await owner(o,venue.id);
 const m=await make('mixed');await member(m);await owner(m,venue.id);
 const s=await make('support');await member(s,'support');
 const r=await make('revoked');await member(r,'super_admin',false);
 const supplied=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES??'/home/coredev/.coredeva-private/pe321-portal-dev'}/cuentas.json`,'utf8'));
 credentials['venue-superadmin']=supplied.venue_superadmin;
 assert(credentials['venue-superadmin']?.email.endsWith('@resend.dev'),'existing DEV venue superadmin fixture');
 const x=await make('outsider',{full_name:'  ',role:'super_admin',is_platform_staff:true});
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 const jwt={};for(const [name,c] of Object.entries(credentials))jwt[name]=(await loginApi(c)).access_token;
 // Permission matrix uses actual user JWTs, never the service key.
 for(const name of ['owner','support','revoked','venue-superadmin','outsider']){
  for(const body of [{action:'list'},{action:'set_role',user_id:a.id,role:'support'},{action:'set_status',user_id:a.id,status:'revoked'},{action:'send_recovery',user_id:a.id}]) assert.equal((await edge(jwt[name],body)).status,403,`${name} ${body.action}`);
  assert.equal((await http(api+'/functions/v1/invite-platform-staff',{email:a.email,role:'super_admin'},jwt[name])).status,403);
  assert.equal((await rpc('portal_tenant_directory',jwt[name])).status,403);
  ok(`${name}: staff management, invitation and tenant directory denied by backend`);
 }
 assert.equal((await edge(anon,{action:'list'})).status,401);ok('Anonymous staff request denied');
 assert.equal((await edge(jwt.admin,{action:'set_role',user_id:a.id,role:'support'})).status,409);
 assert.equal((await edge(jwt.admin,{action:'set_status',user_id:a.id,status:'revoked'})).status,409);ok('Self role/status changes denied by backend');
 // Routing, native login, no wrong shell, name fallback, support, revocation.
 for(const [name,path,target,title] of [
  ['admin','/','/admin','A clear view across PlayERP.'],['owner','/admin/staff','/','Your spaces, in one place.'],
  ['mixed','/','/admin','A clear view across PlayERP.'],['support','/admin/staff','/admin','Platform overview'],
  ['revoked','/admin',null,'Access denied'],['venue-superadmin','/admin',null,'Access denied'],['outsider','/',null,'Access denied']]){
  const {context,page,calls}=await ctx();await loginUi(page,credentials[name],path);await heading(page,title);
  if(target)assert.equal(new URL(page.url()).pathname,target);
  const scopes=await page.evaluate(()=>window.__scopes);
  if(name==='owner')assert(!scopes.includes('Platform administration'));
  if(['admin','mixed','support'].includes(name))assert(!scopes.includes('Owner workspace'));
  if(!target)assert.equal(await page.locator('.portal-layout').count(),0);
  if(name==='owner')assert.equal(await page.locator('.account-trigger-name').innerText(),o.email);
  if(name==='admin')assert.equal(await page.locator('.account-trigger-name').innerText(),'QA admin');
  if(['owner','support','revoked','venue-superadmin','outsider'].includes(name))assert(!calls.some(p=>p.endsWith('portal_tenant_directory')||p.endsWith('platform-staff-admin')));
  if(name==='mixed'){
   await accountMenu(page);await page.getByRole('menuitem',{name:'Owner workspace',exact:true}).click();await heading(page,'Your spaces, in one place.');
   await page.reload();await heading(page,'Your spaces, in one place.');assert.equal(new URL(page.url()).pathname,'/');
   await accountMenu(page);await page.getByRole('menuitem',{name:'Platform administration',exact:true}).click();await heading(page,'A clear view across PlayERP.');
   await page.goto(origin+'/');await heading(page,'A clear view across PlayERP.');
   await logout(page);await loginUi(page,m);await heading(page,'A clear view across PlayERP.');ok('Mixed explicit scope switch persists reload and login resets to admin');
  }
  if(name==='support'){
   await page.goto(origin+'/admin/staff');await heading(page,'Access denied');assert.equal(await page.getByRole('link',{name:'Staff',exact:true}).count(),0);
  }
  ok(`${name}: real login/direct URL, authorized shell and identity`);await context.close();
 }
 // Real existing venue and Print Server rows through the established safe RPCs.
 const directory=await rpc('portal_tenant_directory',jwt.admin);assert.equal(directory.status,200);
 const sample=directory.data.find(v=>v.slug==='adventure-park-demo');assert(sample);
 const detail=await rpc('portal_tenant_detail',jwt.admin,{p_venue_id:sample.id});assert.equal(detail.status,200);assert(detail.data.print_servers.length);
 assert.deepEqual(Object.keys(detail.data).sort(),['print_servers','venue']);
 for(const server of detail.data.print_servers)assert.deepEqual(Object.keys(server).sort(),['id','last_seen_at','software_version','status','venue_id'].sort());
 assert.equal((await rpc('portal_owner_venues',jwt.owner,{p_venue_id:sample.id})).status,403);
 report.reads={directoryCount:directory.data.length,sampleVenue:sample.name,printServers:detail.data.print_servers.map(p=>({id:p.id,status:p.status,software_version:p.software_version,last_seen_at:p.last_seen_at}))};
 for(const width of [1440,834]){
  const {context,page}=await ctx(width);await loginUi(page,a,`/admin/tenants/${sample.id}`);await heading(page,sample.name);
  assert.equal(await page.locator('.servers-table tbody tr').count(),detail.data.print_servers.length);await snapshot(page,`venues-ps-${width}-en`);
  await page.getByRole('button',{name:'ES',exact:true}).click();await page.getByRole('heading',{name:'Print Servers',exact:true}).waitFor();await snapshot(page,`venues-ps-${width}-es`);
  await page.goto(origin+'/admin/staff');await heading(page,'Gestión de staff');await snapshot(page,`staff-${width}-es`);
  await page.getByRole('button',{name:'EN',exact:true}).click();await heading(page,'Staff management');await snapshot(page,`staff-${width}-en`);
  const imgs=await page.locator('img[alt="PlayERP"]').evaluateAll(nodes=>nodes.map(n=>({loaded:n.complete&&n.naturalWidth>0,src:n.getAttribute('src')})));assert(imgs.length&&imgs.every(n=>n.loaded));
  await logout(page);await snapshot(page,`login-${width}-en`);await page.getByRole('button',{name:'ES',exact:true}).click();await snapshot(page,`login-${width}-es`);
  ok(`Real venues/PS, staff, name, brand, logout EN/ES ${width}px`);await context.close();
 }
 // Complete administration through the rendered UI.
 const staffCtx=await ctx(), staffPage=staffCtx.page;await loginUi(staffPage,a,'/admin/staff');await heading(staffPage,'Staff management');
 const selfRow=staffPage.getByRole('row').filter({hasText:a.email});assert.equal(await selfRow.getByRole('combobox').count(),0);assert.equal(await selfRow.getByRole('button').count(),0);
 const inviteEmail=`delivered+${tag}-invited@resend.dev`;
 await staffPage.getByLabel('Email address',{exact:true}).fill(inviteEmail);await staffPage.getByLabel('Invitation language',{exact:true}).selectOption('es');
 const invitationResponse=staffPage.waitForResponse(res=>res.url().endsWith('/functions/v1/invite-platform-staff'));
 await staffPage.getByRole('button',{name:'Send invitation',exact:true}).click();const ir=await invitationResponse;assert.equal(ir.status(),200,'invite from UI');const invitation=await ir.json();ids.push(invitation.user_id);
 assert.equal(invitation.email_sent,true);assert.equal(invitation.locale,'es');assert.equal(invitation.from,'PlayERP <noreply@app.playerp.net>');assert.equal(invitation.membership_status,'invited');
 await staffPage.getByRole('row').filter({hasText:inviteEmail}).getByText('Invited',{exact:true}).waitFor();ok('UI invitation sends PlayERP ES email and lists pending membership');
 const inviteLink=await verifyLink(invitation.user_id,'invite');const inviteCtx=await ctx();await inviteCtx.page.goto(inviteLink.url);await heading(inviteCtx.page,'Crea tu contraseña de staff');
 await inviteCtx.page.reload();await heading(inviteCtx.page,'Crea tu contraseña de staff');await changePassword(inviteCtx.page,password,true);await heading(inviteCtx.page,'Inicio de plataforma');assert.equal(new URL(inviteCtx.page.url()).pathname,'/admin');
 const accepted=await rpc('is_platform_staff',(await loginApi({email:inviteEmail,password})).access_token);assert.equal(accepted.data,true);ok('Real Auth invitation token, refresh, password and acceptance activate only invitee');
 await inviteCtx.context.close();
 const replay=await fetch(inviteLink.link,{redirect:'manual'});assert(new URL(replay.headers.get('location')).hash.includes('error'));ok('Invitation link replay rejected');
 await staffPage.reload();await heading(staffPage,'Staff management');
 await staffAction(staffPage,inviteEmail,'set_role','super_admin');await staffPage.getByRole('row').filter({hasText:inviteEmail}).locator('.staff-role').filter({hasText:'Super admin'}).waitFor();ok('UI role change persisted');
 await staffAction(staffPage,inviteEmail,'set_status','revoked');await staffPage.getByRole('row').filter({hasText:inviteEmail}).getByText('Revoked',{exact:true}).waitFor();
 const revokedJwt=(await loginApi({email:inviteEmail,password})).access_token;assert.equal((await rpc('is_platform_staff',revokedJwt)).data,false);assert.equal((await edge(revokedJwt,{action:'list'})).status,403);
 await staffAction(staffPage,inviteEmail,'set_status','active');await staffPage.getByRole('row').filter({hasText:inviteEmail}).getByText('Active',{exact:true}).waitFor();ok('UI revoke/reactivate changes live authorization');
 const recovery=await staffAction(staffPage,inviteEmail,'send_recovery');assert.equal(recovery.email_sent,true);assert.equal(recovery.locale,'en');ok('UI sends staff recovery');
 // Actual emitted token (request English; preserve its redirect language).
 const recoveryLink=await verifyLink(invitation.user_id,'recovery','en');const recoveryCtx=await ctx();await recoveryCtx.page.goto(recoveryLink.url);await heading(recoveryCtx.page,'Set a new password');
 await recoveryCtx.page.getByRole('button',{name:'ES',exact:true}).click();const newPassword=password+'New';await changePassword(recoveryCtx.page,newPassword);await heading(recoveryCtx.page,'Una visión clara de PlayERP.');
 await loginApi({email:inviteEmail,password:newPassword});ok('Real staff recovery token changes password and returns to permitted admin');await recoveryCtx.context.close();
 // Existing-account invitation never activates on login; explicit acceptance does.
 await staffPage.getByLabel('Email address',{exact:true}).fill(x.email);await staffPage.getByRole('button',{name:'Send invitation',exact:true}).click();await staffPage.getByRole('row').filter({hasText:x.email}).getByText('Invited',{exact:true}).waitFor();
 const existingCtx=await ctx();await loginUi(existingCtx.page,x);await heading(existingCtx.page,'Access denied');assert.equal((await rpc('is_platform_staff',jwt.outsider)).data,false);
 await existingCtx.page.getByRole('link',{name:'Accept staff invitation',exact:true}).click();await existingCtx.page.getByRole('button',{name:'Accept staff invitation',exact:true}).click();await heading(existingCtx.page,'Platform overview');ok('Existing-account invitation requires explicit acceptance');await existingCtx.context.close();
 // Cancel a pending invitation without granting access.
 await staffPage.getByLabel('Email address',{exact:true}).fill(r.email);await staffPage.getByRole('button',{name:'Send invitation',exact:true}).click();await staffPage.getByRole('row').filter({hasText:r.email}).getByText('Invited',{exact:true}).waitFor();
 await staffAction(staffPage,r.email,'set_status','cancel');assert.equal(await staffPage.getByRole('row').filter({hasText:r.email}).count(),0);ok('UI cancellation removes pending membership');
 await staffCtx.context.close();
 // Exact asset bytes and favicon declarations from the served application.
 for(const file of ['playerp-logo-horizontal.png','playerp-logo-horizontal-white.png','playerp-favicon-32.png','playerp-favicon-192.png']){
  const actual=await fetch(`${origin}/brand/${file}`);assert.equal(actual.status,200);const bytes=Buffer.from(await actual.arrayBuffer());
  const canonical=await readFile(new URL('../public/brand/'+file,import.meta.url));assert(bytes.equals(canonical));
  (report.assets??={})[file]=createHash('sha256').update(bytes).digest('hex');
 }
 const html=await (await fetch(origin)).text();assert(html.includes('playerp-favicon-32.png')&&html.includes('playerp-favicon-192.png'));ok('Served logos and favicons exactly match committed canonical assets');
 assert.equal(report.pageErrors.length,0);ok('No browser runtime errors');report.success=true;
} catch(e) {
 report.success=false;report.failure=String(e.message).replace(/eyJ[\w.-]+/g,'[redacted]');console.error(report.failure);process.exitCode=1;
} finally {
 if(browser)await browser.close();
 if(service){
  // Include invitation accounts even if a test failed immediately after sending.
  const remaining=await sql(`select id from auth.users where email like 'delivered+${tag}-%@resend.dev'`);
  for(const row of remaining)if(!ids.includes(row.id))ids.push(row.id);
  for(const token of sessions)await http(api+'/auth/v1/logout?scope=local',{},token);
  if(ids.length){const quoted=ids.map(id=>`'${id}'`).join(',');await sql(`delete from public.admin_audit_log where actor_user_id in (${quoted}) or target_id in (${quoted})`);}
  for(const id of ids){const r=await admin('/auth/v1/admin/users/'+id,undefined,'DELETE');assert([200,204].includes(r.status),'temporary user cleanup');}
  const remainingUsers=await sql(`select count(*)::int as count from auth.users where email like 'delivered+${tag}-%@resend.dev'`);
  report.cleanup={remainingTestUsers:remainingUsers[0].count,rosterCount:(await sql('select count(*)::int as count from public.platform_staff_members'))[0].count};
  assert.equal(report.cleanup.remainingTestUsers,0);assert.equal(report.cleanup.rosterCount,report.initialRosterCount);
 }
 report.finishedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log('Evidence: '+out+'/report.json');
}
