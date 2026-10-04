// Real DEV UI + backend, restricted to PE321 fixtures at WI170P1 Venue.
// Restores original roles and removes only the newly created pending test invite.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert.equal(origin,'https://playerp.dev.bmore.app');
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co',A='c1700000-0000-0000-0000-0000000000a0';
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const owner=accounts.owner_varios,member=accounts.venue_frontdesk;
for(const c of [owner,member])assert(/^delivered\+pe321-[a-z-]+@resend\.dev$/.test(c.email));
const config=await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');
const key=config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];assert(config.includes(api));
const email=process.env.OWNER_TEST_INVITE_EMAIL;assert(/^delivered\+pe368-ui-[a-z0-9-]+@resend\.dev$/.test(email));
const out=process.env.SMOKE_OUTPUT_DIR??'test-results/owner-management-live';await mkdir(out,{recursive:true});
const report={origin,mocks:false,project:'fzwzmwstxlsxdzdmphyq',venue_id:A,checks:[],errors:[],started_at:new Date().toISOString()};
const pass=(name,detail={})=>{report.checks.push({name,...detail});console.log('PASS '+name);};
report.invitation_stage=process.env.OWNER_TEST_SKIP_INVITE==='1'?'skipped (already verified separately)':'included';
const sessions=[];let ownerSession,memberSession,baseline,inviteId,browser;
async function request(path,token,body={}){const r=await fetch(api+path,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token??key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};}
async function login(account){const r=await request('/auth/v1/token?grant_type=password',null,{email:account.email,password:account.password});assert.equal(r.status,200,'fixture login');sessions.push(r.data.access_token);return r.data;}
async function edge(session,body){return request('/functions/v1/owner-venue-users',session.access_token,{...body,venue_id:A});}
async function cleanupChange(session,body){
 for(let attempt=0;attempt<3;attempt++){const r=await edge(session,body);if(r.status!==409||r.data?.error!=='busy_retry'||attempt===2)return r;await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));}
}
async function membership(session,id){
 const r=await fetch(api+'/rest/v1/staff_venue_assignments?select=role,portal_access&venue_id=eq.'+A+'&user_id=eq.'+id,{headers:{apikey:key,Authorization:'Bearer '+session.access_token}});assert.equal(r.status,200,'own membership read under RLS');const data=await r.json();assert.equal(data.length,1);return data[0];
}
async function listing(session){const r=await edge(session,{action:'list'});assert.equal(r.status,200,'list fixture venue');return r.data;}
async function newPage(session,width=1440){const ctx=await browser.newContext({viewport:{width,height:1000},locale:'en'});if(session)await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','en');},session);const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',()=>report.errors.push('browser runtime error'));return page;}
const row=(page,email)=>page.getByTestId('owner-user-row').filter({has:page.getByText(email,{exact:true})});
const confirm=page=>page.getByTestId('owner-user-confirm');
async function openUsers(page){await page.goto(origin+`/?venue=${A}&section=users`);await expect(page.getByTestId('owner-users')).toBeVisible();}
async function confirmWrite(page,action){const response=page.waitForResponse(r=>r.url().endsWith('/owner-venue-users')&&r.request().postDataJSON()?.action===action);await confirm(page).getByRole('button',{name:'Confirm',exact:true}).click();const r=await response;const data=await r.json();assert.equal(r.status(),200,`UI ${action}: ${data.error??'ok'}`);const body=r.request().postDataJSON();assert.equal(body.confirm,true);assert.equal(body.venue_id,A);await expect(confirm(page)).toHaveCount(0);return {body,data};}
try{
 ownerSession=await login(owner);memberSession=await login(member);baseline=await listing(ownerSession);
 const initialMember=baseline.users.find(u=>u.user_id===member.user_id);assert.equal(initialMember.role,'staff');assert.equal(initialMember.portal_access,false);
 assert.equal(baseline.users.find(u=>u.user_id===owner.user_id).role,'owner');
 assert(baseline.users.filter(u=>u.role==='owner').every(u=>u.email.endsWith('@resend.dev')),'all notice recipients must be test sinks');
 assert(!baseline.users.some(u=>u.email===email),'unique test invitation');
 const beforeAccess=await request('/rest/v1/rpc/portal_access',memberSession.access_token);assert.equal(beforeAccess.data.owner_venues.length,0);
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 const page=await newPage(ownerSession);await openUsers(page);
 const calls=[];page.on('request',r=>{if(r.url().endsWith('/owner-venue-users')){const b=r.postDataJSON();if(b?.action!=='list')calls.push(b);}});
 let data;
 if(process.env.OWNER_TEST_SKIP_INVITE!=='1'){
 await page.getByTestId('owner-users-invite').click();const dialog=page.getByTestId('owner-invite-dialog');
 await dialog.getByLabel('Email address',{exact:true}).fill(email);await dialog.getByLabel('First name',{exact:true}).fill('PE368');await dialog.getByLabel('Last name',{exact:true}).fill('UI Pending');await dialog.locator('select').first().selectOption('owner');
 await dialog.getByRole('button',{name:'Send invitation',exact:true}).click();await expect(dialog).toHaveAttribute('role','alertdialog');assert.equal(calls.length,0);
 await page.screenshot({path:`${out}/live-invite-confirm.png`});
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(calls.length,0);
 await dialog.getByRole('button',{name:'Send invitation',exact:true}).click();
 const invited=page.waitForResponse(r=>r.url().endsWith('/owner-venue-users')&&r.request().postDataJSON()?.action==='invite');
 await dialog.getByRole('button',{name:'Confirm and invite Owner',exact:true}).click();const inviteResponse=await invited;const inviteResult=await inviteResponse.json();
 assert.equal(inviteResponse.status(),200,`invite ${inviteResult.error??'ok'}`);inviteId=inviteResult.user_id;assert.equal(inviteResponse.request().postDataJSON().confirm,true);assert.equal(inviteResult.role,'owner');await expect(dialog).toHaveCount(0);
 data=await listing(ownerSession);const created=data.users.find(u=>u.user_id===inviteId);assert.equal(created.role,'owner');assert.equal(created.portal_access,true);assert.equal(created.status,'invited');
 pass('Hosted UI invited a pending owner with explicit confirmation; cancellation sent nothing',{http:200,effective_portal_access:true,status:created.status,email_sent:inviteResult.email_sent,notified:inviteResult.notified,notify_failed:inviteResult.notify_failed});
 await row(page,email).getByTestId('owner-user-remove').click();await confirmWrite(page,'owner_change');inviteId=null;
 pass('Hosted UI removed the pending owner invitation after confirmation',{http:200});
 }
 await row(page,member.email).locator('select').selectOption('owner');await expect(confirm(page)).toBeVisible();
 await page.screenshot({path:`${out}/live-appoint-confirm.png`});await confirmWrite(page,'owner_change');
 data=await listing(ownerSession);const promoted=data.users.find(u=>u.user_id===member.user_id);assert.equal(promoted.role,'owner');assert.equal(promoted.portal_access,true);assert.deepEqual(await membership(memberSession,member.user_id),{role:'owner',portal_access:false});
 const memberPage=await newPage(null,390);await memberPage.goto(origin+`/?venue=${A}&section=users`);
 await memberPage.getByLabel('Email address',{exact:true}).fill(member.email);await memberPage.getByLabel('Password',{exact:true}).fill(member.password);await memberPage.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(memberPage.getByTestId('owner-users')).toBeVisible();
 const uiToken=await memberPage.evaluate(()=>JSON.parse(localStorage.getItem('playerp.portal.dev.auth')).access_token);sessions.push(uiToken);
 await openUsers(memberPage);
 await expect(row(memberPage,member.email).getByTestId('owner-user-portal')).toHaveText('Always (owner)');
 assert(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await memberPage.screenshot({path:`${out}/live-new-owner-mobile.png`,fullPage:true});
 const memberAccess=await request('/rest/v1/rpc/portal_access',memberSession.access_token);assert(memberAccess.data.owner_venues.some(v=>v.id===A&&v.is_owner===true));
 pass('Newly appointed owner signed in through the hosted login and opened Users with portal_access false',{http:200,portal_access:false,viewport:390});
 await row(memberPage,owner.email).locator('select').selectOption('manager');await confirmWrite(memberPage,'owner_change');
 data=await listing(memberSession);assert.equal(data.users.find(u=>u.user_id===owner.user_id).role,'manager');assert(data.owner_count>=1);
 await row(memberPage,owner.email).locator('select').selectOption('owner');await confirmWrite(memberPage,'owner_change');
 await openUsers(page);await row(page,member.email).locator('select').selectOption('staff');await confirmWrite(page,'owner_change');
 data=await listing(ownerSession);assert.equal(data.users.find(u=>u.user_id===member.user_id).role,'staff');assert.equal(data.users.find(u=>u.user_id===member.user_id).portal_access,false);
 pass('Both owners managed the other from the hosted UI: new owner demoted and restored original; original demoted new owner',{http:200,confirmed:true});
 assert(!calls.some(b=>b.action==='set_portal_access'));
 await openUsers(page);await page.screenshot({path:`${out}/live-restored-users.png`,fullPage:true});
 const finalAccess=await request('/rest/v1/rpc/portal_access',memberSession.access_token);assert.equal(finalAccess.data.owner_venues.length,0);
 pass('Demoted fixture no longer has Owner Portal access; no manual portal_access grant was made',{portal_access:false,venues:0});
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=String(e.message);throw e;}
finally{
 try{
  if(baseline&&ownerSession&&memberSession){
   let current=await edge(ownerSession,{action:'list'});
   if(current.status===403){const restored=await cleanupChange(memberSession,{action:'owner_change',operation:'appoint',user_id:owner.user_id,confirm:true});assert.equal(restored.status,200,'restore primary owner');}
   current=await listing(ownerSession);
   const target=current.users.find(u=>u.user_id===member.user_id),original=baseline.users.find(u=>u.user_id===member.user_id);
   if(target.role!==original.role){const restored=await cleanupChange(ownerSession,{action:'owner_change',operation:'demote',user_id:member.user_id,role:original.role,confirm:true});assert.equal(restored.status,200,'restore fixture role');}
   // Also find the invite if the process failed after server success but before reading its ID.
   const pending=current.users.find(u=>u.email===email);if(pending){const removed=await cleanupChange(ownerSession,{action:'owner_change',operation:'remove',user_id:pending.user_id,confirm:true});assert.equal(removed.status,200,'remove test invite');}
   const final=await listing(ownerSession);const shape=users=>users.map(u=>[u.user_id,u.role,u.portal_access]).sort((a,b)=>a[0].localeCompare(b[0]));assert.deepEqual(shape(final.users),shape(baseline.users));report.fixture_restored=true;
  }
 }finally{
  for(const token of sessions)await request('/auth/v1/logout?scope=local',token);
  report.completed_at=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();
 }
}
