// Synthetic fixtures only: every backend request is answered in-process by an
// in-memory fake. This verifies the browser behaviour of the Users tab of
// /admin/tenants/:id and the retired /admin/users, NOT live DEV permissions/email.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
const out=(process.env.SMOKE_OUTPUT_DIR??new URL('../test-results/smoke/',import.meta.url).pathname).replace(/\/?$/, '/');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const records=[],errors=[];
const uid='11111111-1111-4111-8111-111111111111',v1='22222222-2222-4222-8222-222222222222';
const u1='77777777-7777-4777-8777-777777777771',u2='77777777-7777-4777-8777-777777777772',u3='77777777-7777-4777-8777-777777777773';
const venue={id:v1,name:'Sample Harbor',slug:'sample-harbor',city:'Valencia',state:null,address:'Sample street 1',phone:null,email:null,timezone:'Europe/Madrid',is_active:true};
const user={id:uid,email:'portal-test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T10:00:00Z'};
const person=(user_id,email,full_name,role,over={})=>({user_id,email,full_name,role,status:'active',protected:false,member_since:'2026-09-01T10:00:00Z',last_sign_in_at:null,other_venue_count:0,is_self:false,...over});
function session(seconds=3600){const exp=Math.floor(Date.now()/1000)+seconds,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return {access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic-not-valid`,refresh_token:'synthetic-not-valid',expires_in:seconds,expires_at:exp,token_type:'bearer',user};}
async function setup({role='super_admin',width=1440,locale='es'}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000},locale}),requests=[],calls=[];
 const admin=role==='super_admin';
 let members=[person(uid,user.email,'Portal Test','manager',{is_self:true}),person(u1,'ana@example.invalid','Ana Ruiz','front_desk',{other_venue_count:2}),
  person(u2,'legacy@example.invalid','Legacy Admin','super_admin',{protected:true}),person(u3,'leo@example.invalid',null,'fnb_staff',{status:'invited',other_venue_count:1})];
 await ctx.addInitScript(s=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));sessionStorage.setItem('seeded','1');}},session());
 await ctx.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push(url.pathname);
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname==='/auth/v1/token')return send(session());
  if(url.pathname==='/auth/v1/user')return send(user);
  if(url.pathname==='/rest/v1/staff_profiles')return send(null);
  if(url.pathname.endsWith('/is_platform_staff'))return send(true);
  if(url.pathname.endsWith('/portal_access'))return send({is_platform_staff:admin,platform_role:role,owner_venues:[]});
  if(url.pathname.endsWith('/portal_tenant_directory'))return send([venue]);
  if(url.pathname.endsWith('/portal_tenant_detail'))return send({venue,print_servers:[]});
  if(url.pathname==='/functions/v1/platform-identity-admin'){
   const body=req.postDataJSON();calls.push(body);
   if(!admin)return send({error:'forbidden'},403);
   if(body.venue_id!==v1)return send({error:'venue_not_found'},404);
   if(body.action==='list')return send({venue:{id:v1,name:venue.name,is_active:true},users:members,roles:['manager','front_desk','fnb_staff','display_staff']});
   if(body.action==='invite'){
    if(members.some(m=>m.email===body.email))return send({error:'already_member'},409);
    if(body.role==='display_staff')return send({error:'display_staff_dedicated'},422);
    members=[...members,person('77777777-7777-4777-8777-777777777779',body.email,`${body.first_name} ${body.last_name}`,body.role,{status:'invited'})];
    return send({success:true,created:true,email_sent:true,user_id:'77777777-7777-4777-8777-777777777779',venue_id:v1,role:body.role});
   }
   if(body.action==='set_role'){const previous=members.find(m=>m.user_id===body.user_id).role;members=members.map(m=>m.user_id===body.user_id?{...m,role:body.role}:m);return send({success:true,changed:true,role:body.role,previous_role:previous});}
   if(body.action==='revoke'){members=members.filter(m=>m.user_id!==body.user_id);return send({success:true,changed:true,remaining_venue_count:2,profile_deactivated:false});}
   if(body.action==='send_recovery')return send({success:true,email_sent:true,user_id:body.user_id,venue_id:v1,locale:body.locale});
   return send({error:'invalid_action'},422);
  }
  throw new Error('Unexpected fixture API request '+url.pathname);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));return {ctx,page,requests,calls};
}
const heading=(page,name)=>page.getByRole('heading',{name,exact:true}).waitFor();
const noOverflow=async page=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
const record=name=>{records.push(name);console.log('PASS '+name);};
const rows=page=>page.getByTestId('venue-user-row');
const notice=page=>page.locator('.staff-notice');
// The notice appears before the refetch ends, so writes are read apart from the list calls.
const lastWrite=calls=>calls.filter(call=>call.action!=='list').at(-1);
try{
 {
  const {ctx,page,calls}=await setup();
  await page.goto(origin+'/admin/tenants/'+v1);await heading(page,'Sample Harbor');
  await heading(page,'Datos del local');assert.equal(calls.length,0);
  assert.equal(await page.locator('.sidebar-nav a[href="/admin/users"]').count(),0);
  await page.getByTestId('venue-users-tab').click();await page.waitForURL(origin+'/admin/tenants/'+v1+'/users');
  await heading(page,'Usuarios de este local');assert.equal(await rows(page).count(),4);
  assert.deepEqual((await page.locator('.staff-table thead th').allTextContents()).map(s=>s.trim()),['Nombre','Correo electrónico','Rol en este local','Estado','Acciones']);
  assert.deepEqual(calls.at(-1),{action:'list',venue_id:v1});
  const ana=rows(page).filter({hasText:'ana@example.invalid'}),legacy=rows(page).filter({hasText:'legacy@example.invalid'}),self=rows(page).filter({hasText:user.email});
  assert.match(await ana.textContent(),/\+2 locales más/);assert.match(await ana.textContent(),/Recepción/);
  assert.match(await rows(page).filter({hasText:'leo@example.invalid'}).textContent(),/\+1 local más[\s\S]*Invitado/);
  for(const row of [legacy,self])assert.equal(await row.locator('select,button').count(),0);
  assert.equal(await ana.locator('select option[value="super_admin"]').count(),0);
  await noOverflow(page);await page.screenshot({path:out+'venue-users-1440-es.png',fullPage:true});
  record('Admin opens the Users tab of a venue: only that venue, protected and own rows read-only');

  await ana.locator('select').selectOption('manager');
  const confirm=page.getByTestId('venue-user-confirm');await confirm.waitFor();
  assert.match(await confirm.textContent(),/Ana Ruiz a Gerente en Sample Harbor.*solo se aplica a este local/);
  await confirm.getByRole('button',{name:'Confirmar'}).click();await notice(page).getByText('Rol actualizado solo en este local.').waitFor();
  assert.deepEqual(lastWrite(calls),{action:'set_role',user_id:u1,role:'manager',venue_id:v1});
  await ana.getByText('Gerente',{exact:true}).first().waitFor();
  record('Role change is confirmed, sent for this venue only and the list is refetched');

  await ana.getByRole('button',{name:'Enviar correo de recuperación'}).click();await confirm.getByRole('button',{name:'Confirmar'}).click();
  await notice(page).getByText('Correo de recuperación enviado.').waitFor();
  assert.deepEqual(lastWrite(calls),{action:'send_recovery',user_id:u1,locale:'es',venue_id:v1});
  record('Recovery email is confirmed and sent with the interface language');

  await page.getByTestId('venue-users-invite').click();
  const dialog=page.getByTestId('venue-invite-dialog');await dialog.waitFor();
  await dialog.getByRole('button',{name:'Enviar invitación'}).click();await dialog.getByRole('alert').getByText('Introduce un correo electrónico válido.').waitFor();
  await dialog.locator('input[type="email"]').fill('ana@example.invalid');await dialog.locator('input[type="text"]').nth(0).fill('Ana');await dialog.locator('input[type="text"]').nth(1).fill('Ruiz');
  await dialog.getByRole('button',{name:'Enviar invitación'}).click();
  await dialog.getByRole('alert').getByText('Esta persona ya tiene acceso a este local. Cambia su rol desde la lista.').waitFor();
  await dialog.locator('input[type="email"]').fill('Nora@Example.invalid');await dialog.locator('input[type="text"]').nth(0).fill(' Nora ');await dialog.locator('input[type="text"]').nth(1).fill('Vidal');
  await dialog.locator('select').first().selectOption('display_staff');await dialog.getByRole('button',{name:'Enviar invitación'}).click();
  await dialog.getByRole('alert').getByText(/Las cuentas de Pantallas son dedicadas/).waitFor();
  await page.screenshot({path:out+'venue-users-invite-es.png'});
  await dialog.locator('select').first().selectOption('fnb_staff');await dialog.getByRole('button',{name:'Enviar invitación'}).click();
  await dialog.waitFor({state:'detached'});await notice(page).getByText('Invitación enviada. La persona tendrá acceso solo a este local.').waitFor();
  assert.deepEqual(lastWrite(calls),{action:'invite',email:'nora@example.invalid',first_name:'Nora',last_name:'Vidal',role:'fnb_staff',locale:'es',venue_id:v1});
  await rows(page).nth(4).waitFor();assert.equal(await rows(page).count(),5);
  record('Invite dialog validates, shows backend refusals in place, then invites to this venue and refetches');

  await ana.getByRole('button',{name:'Quitar de este local'}).click();
  assert.match(await confirm.textContent(),/Solo se retira el acceso a ESTE local/);
  await confirm.getByRole('button',{name:'Cancelar'}).click();assert.equal(await rows(page).count(),5);
  await ana.getByRole('button',{name:'Quitar de este local'}).click();await confirm.getByRole('button',{name:'Confirmar'}).click();
  await notice(page).getByText('Acceso a este local revocado. La persona conserva el acceso a sus otros locales.').waitFor();
  assert.deepEqual(lastWrite(calls),{action:'revoke',user_id:u1,venue_id:v1});await ana.waitFor({state:'detached'});assert.equal(await rows(page).count(),4);
  record('Revocation names this venue only, can be cancelled, and removes the row after confirming');

  for(const path of ['/admin/users','/admin/users/'+u1]){await page.goto(origin+path);await page.waitForURL(origin+'/admin/tenants');await heading(page,'Directorio de tenants');}
  record('Retired /admin/users and /admin/users/:id redirect to the venue directory');

  await page.goto(origin+'/admin/tenants/'+v1+'/users?lang=en');await heading(page,'Users of this venue');
  assert.deepEqual((await page.locator('.detail-tabs a').allTextContents()).map(s=>s.trim()),['Venue details','Users']);
  assert.equal(await page.locator('.detail-tabs a[aria-current="page"]').textContent(),'Users');
  record('Users tab is directly addressable and bilingual');await ctx.close();
 }
 {
  const {ctx,page}=await setup({width:390});
  await page.goto(origin+'/admin/tenants/'+v1+'/users');await heading(page,'Usuarios de este local');
  await noOverflow(page);await page.screenshot({path:out+'venue-users-390-es.png',fullPage:true});
  await page.getByTestId('venue-users-invite').click();await page.getByTestId('venue-invite-dialog').waitFor();await page.screenshot({path:out+'venue-users-invite-390-es.png'});
  record('Users tab has no horizontal overflow at 390px');await ctx.close();
 }
 for(const role of ['operations','support']){
  const {ctx,page,requests}=await setup({role,locale:'en'});
  await page.goto(origin+'/admin/tenants/'+v1+'/users');await heading(page,'Access denied');
  await page.goto(origin+'/admin/tenants/'+v1);
  if(role==='operations'){await heading(page,'Sample Harbor');await heading(page,'Venue details');}else await heading(page,'Access denied');
  assert.equal(await page.locator('.detail-tabs,[data-testid="venue-users-tab"],[data-testid="venue-users"],a[href$="/users"]').count(),0);
  assert(!requests.some(x=>x.includes('/functions/')));
  record(role+': no Users tab, direct URL denied, no identity request');await ctx.close();
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:records.length,fixtureOnly:true}));
}finally{await browser.close();}
