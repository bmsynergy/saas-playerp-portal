// Browser contract checks with synthetic API responses. Never evidence of live authorization.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out=process.env.SMOKE_OUTPUT_DIR??'test-results/owner-management-states';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const A='22222222-2222-4222-8222-222222222222',U='11111111-1111-4111-8111-111111111111';
const venue={id:A,name:'Harbor Test',is_owner:true,is_active:true};
const user={id:U,email:'self@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-04T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={user,access_token:`${enc({alg:'HS256'})}.${enc({sub:U,exp,aud:'authenticated',role:'authenticated',session_id:U})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer'};
const report={origin,mocks:true,checks:[],errors:[]};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
async function setup(locale='en',width=1440){
 const ctx=await browser.newContext({viewport:{width,height:1000},locale});
 await ctx.addInitScript(({s,locale})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale',locale);},{s:session,locale});
 const row=(id,role,extra={})=>({user_id:id,email:id+'@example.invalid',full_name:id,status:'active',role,portal_access:false,is_self:false,locked:null,owner_actions:[],...extra});
 const db={writes:[],error:null,result:{success:true,changed:true,email_sent:true,notify_failed:0},
  users:[row(U,'owner',{is_self:true,locked:'self'}),row('other','owner',{locked:'owner',owner_actions:['demote','remove']}),row('member','staff',{owner_actions:['appoint']}),row('screen','display_staff'),row('legacy','super_admin',{locked:'super_admin'}),row('removeonly','owner',{locked:'owner',owner_actions:['remove']})]};
 await ctx.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  if(name==='is_platform_staff')return send(false);
  if(name==='portal_access')return send({is_platform_staff:false,owner_venues:[venue]});
  if(name==='portal_owner_venues')return send([venue]);
  if(name==='owner-venue-users'){
   const body=req.postDataJSON();assert.equal(body.venue_id,A);
   if(body.action==='list')return send({venue,users:db.users,roles:['staff','manager','display_staff'],invite_roles:['owner','staff','manager','display_staff'],owner_count:3});
   db.writes.push(body);
   if(db.error)return send({error:db.error},409);
   if(body.action==='owner_change'){
    const person=db.users.find(p=>p.user_id===body.user_id);
    if(body.operation==='remove')db.users=db.users.filter(p=>p!==person);
    else {person.role=body.operation==='appoint'?'owner':body.role;person.locked=person.role==='owner'?'owner':null;person.owner_actions=person.role==='owner'?['demote','remove']:['appoint'];}
   }
   return send(db.result);
  }
  report.errors.push('Unexpected API '+name);return send({error:'unexpected'},500);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+`/?venue=${A}&section=users`);await expect(page.getByTestId('owner-users')).toBeVisible();
 return {ctx,page,db};
}
const row=(page,email)=>page.getByTestId('owner-user-row').filter({has:page.getByText(email,{exact:true})});
const confirm=page=>page.getByTestId('owner-user-confirm');
async function fit(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');}
try {
 for(const width of [1440,390]){
  const {ctx,page,db}=await setup('en',width);
  assert.equal(await row(page,user.email).count(),0); // self uses UUID fixture email
  await expect(row(page,U+'@example.invalid').locator('select')).toHaveCount(0);
  await expect(row(page,'legacy@example.invalid').locator('select')).toHaveCount(0);
  await expect(row(page,'screen@example.invalid').locator('option[value="owner"]')).toHaveCount(0);
  await expect(row(page,'removeonly@example.invalid').locator('select')).toHaveCount(0);
  await expect(row(page,'other@example.invalid').getByTestId('owner-user-portal')).toHaveClass(/staff-status-active/);
  await expect(row(page,'other@example.invalid').getByTestId('owner-user-portal-toggle')).toHaveCount(0);
  await fit(page);await page.screenshot({path:`${out}/users-${width}.png`,fullPage:true});
  await page.getByTestId('owner-users-invite').click();let dialog=page.getByTestId('owner-invite-dialog');
  await expect(dialog.locator('select').first()).not.toHaveValue('owner');
  await dialog.getByLabel('Email address',{exact:true}).fill('new@example.invalid');
  await dialog.getByLabel('First name',{exact:true}).fill('New');await dialog.getByLabel('Last name',{exact:true}).fill('Owner');
  await dialog.locator('select').first().selectOption('owner');
  await dialog.getByRole('button',{name:'Send invitation',exact:true}).click();
  await expect(dialog).toHaveAttribute('role','alertdialog');assert.equal(db.writes.length,0);
  await expect(dialog).toContainText('new@example.invalid');await expect(dialog).toContainText('Harbor Test');
  await fit(page);await page.screenshot({path:`${out}/invite-confirm-${width}.png`});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(db.writes.length,0);
  await expect(dialog.locator('form')).toBeVisible();
  await dialog.getByRole('button',{name:'Send invitation',exact:true}).click();
  await dialog.getByRole('button',{name:'Confirm and invite Owner',exact:true}).click();
  await expect(dialog).toHaveCount(0);assert.deepEqual(db.writes[0],{action:'invite',email:'new@example.invalid',first_name:'New',last_name:'Owner',role:'owner',locale:'en',confirm:true,venue_id:A});
  pass(`${width}px: invitation requires explicit confirmation, cancel sends nothing, owner access shown active and protected rows have no actions`);
  let member=row(page,'member@example.invalid');await member.locator('select').selectOption('owner');
  await expect(confirm(page)).toBeVisible();assert.equal(db.writes.length,1);
  await confirm(page).getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(db.writes.length,1);
  await member.locator('select').selectOption('owner');await confirm(page).getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(confirm(page)).toHaveCount(0);assert.deepEqual(db.writes.at(-1),{action:'owner_change',operation:'appoint',user_id:'member',confirm:true,venue_id:A});
  await member.locator('select').selectOption('manager');await expect(confirm(page)).toContainText('Manager');assert.equal(db.writes.length,2);
  await fit(page);await page.screenshot({path:`${out}/demote-confirm-${width}.png`});
  await confirm(page).getByRole('button',{name:'Confirm',exact:true}).click();await expect(confirm(page)).toHaveCount(0);
  assert.deepEqual(db.writes.at(-1),{action:'owner_change',operation:'demote',user_id:'member',confirm:true,role:'manager',venue_id:A});
  await row(page,'other@example.invalid').getByTestId('owner-user-remove').click();assert.equal(db.writes.length,3);
  await confirm(page).getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(db.writes.length,3);
  await row(page,'other@example.invalid').getByTestId('owner-user-remove').click();await confirm(page).getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(confirm(page)).toHaveCount(0);await expect(row(page,'other@example.invalid')).toHaveCount(0);
  assert.deepEqual(db.writes.at(-1),{action:'owner_change',operation:'remove',user_id:'other',confirm:true,venue_id:A});
  assert(!db.writes.some(w=>w.action==='set_portal_access'));
  pass(`${width}px: appoint, demote and remove require confirmation and send the secure owner_change contract; no portal_access writes`);
  await ctx.close();
 }
 for(const locale of ['en','es']){
  const {ctx,page,db}=await setup(locale,390);
  db.error='last_owner';await row(page,'other@example.invalid').getByTestId('owner-user-remove').click();
  const button=locale==='es'?'Confirmar':'Confirm';await confirm(page).getByRole('button',{name:button,exact:true}).click();
  await expect(confirm(page).getByRole('alert')).toContainText(locale==='es'?'No puedes quitar al último dueño':'last Owner');
  await fit(page);await page.screenshot({path:`${out}/last-owner-${locale}.png`});
  for(const code of ['confirmation_required','busy_retry','not_owner','account_unconfirmed']){
   db.error=code;const response=page.waitForResponse(r=>r.url().endsWith('/owner-venue-users')&&r.request().postDataJSON()?.action==='owner_change');await confirm(page).getByRole('button',{name:button,exact:true}).click();await response;
   await expect(confirm(page).getByRole('alert')).toBeVisible();await expect(confirm(page)).not.toContainText(code);
  }
  db.error=null;db.result.notify_failed=1;await confirm(page).getByRole('button',{name:button,exact:true}).click();await expect(confirm(page)).toHaveCount(0);
  await expect(page.locator('.staff-notice')).toContainText(locale==='es'?'Se guardó':'saved');
  pass(`${locale}: last-owner safeguard and other server refusals remain visible inside confirmation; failed email notice does not undo success`);
  await ctx.close();
 }
 for(const locale of ['en','es']){
  const {ctx,page}=await setup(locale,390);
  const label=locale==='es'?'Personal':'Staff';
  await expect(row(page,'member@example.invalid').locator('option[value="staff"]')).toHaveText(label);
  await page.getByTestId('owner-users-invite').click();
  await expect(page.getByTestId('owner-invite-dialog').locator('option[value="staff"]')).toHaveText(label);
  pass(`${locale}: Staff role is ${label} in invitation and existing user role selector`);
  await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
} finally {await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
