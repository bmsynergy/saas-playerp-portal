// Browser regression with synthetic Auth/RPC responses; not a live email test.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const out = process.env.SMOKE_OUTPUT_DIR ?? 'test-results/invitation-states'; await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args:['--no-sandbox']});
const id='11111111-1111-4111-8111-111111111111', venue={id:'22222222-2222-4222-8222-222222222222', name:'Invite Test Venue', is_owner:true, is_active:true};
const user={id,email:'invited@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-04T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={user,access_token:`${enc({alg:'HS256'})}.${enc({sub:id,exp,aud:'authenticated',role:'authenticated',session_id:id})}.synthetic`,refresh_token:'synthetic',expires_in:3600,expires_at:exp,token_type:'bearer'};
const report={origin,mocks:true,checks:[],errors:[]};
try {
 for (const scenario of ['owner','saved-password-retry','access-retry','staff','dual','no-invitation','recovery']) {
  const ctx=await browser.newContext({viewport:{width:scenario==='owner'?390:1440,height:1000},locale:'en'});
  let updates=0, accepts=0, staff=false, failAccess=scenario==='access-retry';
  const owner=!['staff','no-invitation'].includes(scenario);
  await ctx.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**', async route=>{
   const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
   const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'x-supabase-api-version':'2024-01-01','access-control-expose-headers':'X-Supabase-Api-Version'},body:JSON.stringify(body)});
   if(url.pathname==='/auth/v1/user') {
    if(req.method()==='PUT') { updates++; if((scenario==='saved-password-retry')||(scenario==='access-retry'&&updates>1))return send({code:'same_password',msg:'New password should be different from the old password.'},422); }
    return send(user);
   }
   if(url.pathname==='/auth/v1/token')return send(session);
   if(name==='staff_profiles')return send(null);
   if(name==='is_platform_staff')return send(staff);
   if(name==='portal_access') {
    if(updates&&failAccess){ failAccess=false; return send({message:'temporary failure'},500); }
    return send({is_platform_staff:staff,platform_role:staff?'support':null,owner_venues:owner?[venue]:[]});
   }
   if(name==='accept_platform_invitation') { accepts++; if(!['staff','dual'].includes(scenario))return send({code:'P0002',message:'no_pending_invitation'},404); staff=true; return send({status:'accepted'}); }
   if(name==='portal_owner_venues')return send([venue]);
   if(name==='portal_tenant_directory')return send([]);
   if(name==='owner-venue-users')return send({venue,users:[{user_id:id,email:user.email,full_name:'Invited Owner',role:'owner',status:'active',portal_access:false,is_self:true,locked:'self',owner_actions:[]}],roles:['manager'],invite_roles:['owner','manager'],owner_count:2});
   report.errors.push('Unexpected API '+url.pathname);return send({},500);
  });
  const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
  const fragment=new URLSearchParams({access_token:session.access_token,refresh_token:session.refresh_token,expires_in:'3600',token_type:'bearer',type:scenario==='recovery'?'recovery':'invite'});
  await page.goto(origin+'/auth/password?'+(scenario==='recovery'?'recovery=1':'invite=1')+'#'+fragment);
  await expect(page.getByRole('heading',{name:scenario==='recovery'?'Set a new password':'Create your password',exact:true})).toBeVisible();
  assert.equal(new URL(page.url()).hash,'');
  if(scenario==='saved-password-retry'){await page.reload();await expect(page.getByRole('heading',{name:scenario==='recovery'?'Set a new password':'Create your password',exact:true})).toBeVisible();}
  await page.getByLabel('New password',{exact:true}).fill('Fixture-only-password-42');
  await page.getByLabel('Confirm new password',{exact:true}).fill('Fixture-only-password-42');
  await page.getByRole('button',{name:'Save new password',exact:true}).click();
  if(scenario==='access-retry'){
   await expect(page.getByRole('alert')).toBeVisible();
   await page.getByRole('button',{name:'Save new password',exact:true}).click();
  }
  if(scenario==='no-invitation') {
   await expect(page.getByRole('alert')).toBeVisible();
   await expect(page.getByRole('heading',{name:scenario==='recovery'?'Password updated':'Your account is ready',exact:true})).toHaveCount(0);
   assert.equal(accepts,1);
  } else {
   await expect(page.getByRole('heading',{name:scenario==='recovery'?'Password updated':'Your account is ready',exact:true})).toBeVisible().catch(async error=>{console.log(scenario,updates,accepts,await page.locator('body').innerText());throw error;});
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('playerp.portal.invitation')),null);
   await page.getByRole('link',{name:'Continue to PlayERP',exact:true}).click();
   if(owner&&scenario!=='dual'){
    await page.goto(origin+`/?venue=${venue.id}&section=users`);
    await expect(page.getByTestId('owner-users')).toBeVisible();
    await expect(page.getByTestId('owner-user-remove')).toHaveCount(0);
    await expect(page.getByText('You cannot remove yourself or change your own role. Another owner must do it.',{exact:true})).toBeVisible();
    assert.equal(accepts,scenario==='recovery'?0:scenario==='access-retry'?2:1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   } else {await expect(page).toHaveURL(/\/admin/);assert.equal(accepts,1);}
  }
  await page.screenshot({path:`${out}/${scenario}.png`,fullPage:true});
  report.checks.push({scenario,updates,platform_accepts:accepts}); console.log('PASS '+scenario);
  await ctx.close();
 }
 assert.deepEqual(report.errors,[]);
} finally { await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close(); }
