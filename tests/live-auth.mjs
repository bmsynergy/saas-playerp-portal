// Opt-in, DEV-only acceptance check. No tokens/passwords/links written to evidence.
// RUN_DEV_RECOVERY=1 sends ONE real email, changes and restores a test password.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app','http://127.0.0.1:18799'].includes(origin));
const privateDir=process.env.PORTAL_DEV_FIXTURES;assert(privateDir);
const accounts=JSON.parse(await readFile(`${privateDir}/cuentas.json`,'utf8'));
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const config=await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');assert(config.includes(api));
const key=config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];
const out=process.env.LIVE_OUTPUT_DIR??new URL('../test-results/live-auth/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const storageKey='playerp.portal.dev.auth';
const report={origin,project:'fzwzmwstxlsxdzdmphyq',startedAt:new Date().toISOString(),mocks:false,checks:[]};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const sessions=[];
async function request(path,token,body,method='POST'){
 const r=await fetch(api+path,{method,headers:{apikey:key,Authorization:`Bearer ${token??key}`,'Content-Type':'application/json'},body:JSON.stringify(body??{})});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}return {status:r.status,data};
}
async function apiLogin(profile,password=accounts[profile].password){
 const r=await request('/auth/v1/token?grant_type=password',null,{email:accounts[profile].email,password});assert.equal(r.status,200,'test account login');sessions.push(r.data.access_token);return r.data;
}
async function context(){const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'en'});const page=await ctx.newPage();page.setDefaultTimeout(20000);return {ctx,page};}
const heading=(page,name)=>page.getByRole('heading',{name,exact:true}).waitFor();
async function uiLogin(page,profile){await page.goto(origin+'/');await heading(page,'Sign in to your workspace');await page.getByLabel('Email address',{exact:true}).fill(accounts[profile].email);await page.getByLabel('Password',{exact:true}).fill(accounts[profile].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await heading(page,'Your spaces, in one place.');}
async function expireLocalMetadata(page){
 // Move only the SDK's local expiry hint to force its real refresh path now.
 // The signed JWT, server expiry and all project-wide session settings stay intact.
 await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.expires_at=Math.floor(Date.now()/1000)-1;localStorage.setItem(k,JSON.stringify(s));},storageKey);
}
try{
 {
  const {ctx,page}=await context();await uiLogin(page,'owner_varios');
  const before=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey);
  await expireLocalMetadata(page);
  const refreshed=page.waitForResponse(r=>r.url().includes('/auth/v1/token?grant_type=refresh_token'));
  await page.reload();const response=await refreshed;assert.equal(response.status(),200);await heading(page,'Your spaces, in one place.');
  const after=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey);assert.notEqual(after.refresh_token,before.refresh_token);
  report.checks.push({case:'valid renewal',http:200,result:'SDK rotated a real DEV refresh token and kept the owner route',method:'local expiry metadata advanced; no token or API mock'});
  // Preserve an independent session of this same fixture as the isolation control.
  const other=await apiLogin('owner_varios');
  const revoke=await request('/auth/v1/logout?scope=local',after.access_token);assert.equal(revoke.status,204);
  await expireLocalMetadata(page);
  const rejected=page.waitForResponse(r=>r.url().includes('/auth/v1/token?grant_type=refresh_token'));
  await page.reload();const denied=await rejected;assert.equal(denied.status(),400);const deniedData=await denied.json();assert.equal(deniedData.code,'refresh_token_not_found');
  await heading(page,'Sign in to your workspace');assert.equal(await page.evaluate(k=>localStorage.getItem(k),storageKey),null);
  assert.equal(await page.locator('.owner-venue-card').count(),0);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('playerp.portal.venue.')).length),0);
  const control=await request('/auth/v1/token?grant_type=refresh_token',null,{refresh_token:other.refresh_token});assert.equal(control.status,200);sessions.push(control.data.access_token);
  await page.screenshot({path:`${out}/revoked-session-login.png`,fullPage:true});
  report.checks.push({case:'nonrenewable session',revokedScope:'local test session only',refresh:400,code:deniedData.code,result:'login; auth storage and private venue selection removed',otherSessionSameUser:200});
  await ctx.close();console.log('PASS real renewal, single-session revocation, independent session preserved');
 }
 if(process.env.RUN_DEV_RECOVERY==='1'){
  assert.equal(origin,'https://playerp.dev.bmore.app','Real email must return to official DEV portal');
  const {ctx,page}=await context();let changed=false,restoreToken=null;
  const newPassword=randomBytes(24).toString('base64url')+'-aA1!';
  try{
   await page.goto(origin+'/auth/forgot');await heading(page,'Reset your password');
   await page.getByLabel('Email address',{exact:true}).fill(accounts.owner_uno.email);
   const requested=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/v1/recover');
   await page.getByRole('button',{name:'Send recovery email',exact:true}).click();const sent=await requested;
   if(sent.status()!==200){const body=await sent.json();report.checks.push({case:'real recovery request',http:sent.status(),code:body.code});throw new Error(`Recovery request HTTP ${sent.status()} (${body.code})`);}
   assert.equal(new URL(sent.url()).searchParams.get('redirect_to'),origin+'/auth/password?recovery=1');await heading(page,'Check your inbox');
   await page.screenshot({path:`${out}/recovery-email-requested.png`,fullPage:true});
   const mailboxKey=(await readFile(`${privateDir}/buzon.key`,'utf8')).trim();
   const mr=await fetch(api+'/functions/v1/pe321-dev-test-mailbox',{method:'POST',headers:{Authorization:`Bearer ${key}`,'x-pe321-mailbox-key':mailboxKey,'Content-Type':'application/json'},body:JSON.stringify({to:accounts.owner_uno.email})});
   assert.equal(mr.status,200);const mail=await mr.json();assert(mail.pending&&mail.link);assert.equal(mail.redirect_to,origin+'/auth/password?recovery=1');
   const link=new URL(mail.link);assert.equal(link.origin,api);assert.equal(link.pathname,'/auth/v1/verify');
   // Navigate the actual pending email token. Do not record the URL or response hash.
   const verifyResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/v1/verify');
   await page.goto(mail.link);assert.equal((await verifyResponse).status(),303);await heading(page,'Set a new password');
   await page.waitForFunction(()=>!location.hash);
   assert.equal(new URL(page.url()).origin,origin);assert.equal(new URL(page.url()).pathname,'/auth/password');
   await page.reload();await heading(page,'Set a new password');
   await page.getByLabel('New password',{exact:true}).fill(newPassword);await page.getByLabel('Confirm new password',{exact:true}).fill(newPassword);
   const passwordResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/v1/user'&&r.request().method()==='PUT');
   await page.getByRole('button',{name:'Save new password',exact:true}).click();const saved=await passwordResponse;assert.equal(saved.status(),200);changed=true;
   restoreToken=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).access_token,storageKey);
   await heading(page,'Password updated');await page.screenshot({path:`${out}/password-updated.png`,fullPage:true});
   await page.getByRole('link',{name:'Continue to PlayERP',exact:true}).click();await heading(page,'Your spaces, in one place.');assert.equal(new URL(page.url()).pathname,'/');
   const relogin=await apiLogin('owner_uno',newPassword);assert(relogin.access_token);
   const {ctx:invalidCtx,page:invalidPage}=await context();
   const expiredResponse=invalidPage.waitForResponse(r=>new URL(r.url()).pathname==='/auth/v1/verify');
   await invalidPage.goto(mail.link);assert.equal((await expiredResponse).status(),303);
   await invalidPage.getByText('This recovery link is invalid or has expired. Request a new one.',{exact:true}).waitFor();
   assert.equal(new URL(invalidPage.url()).hash,'');await invalidPage.getByRole('button',{name:'ES',exact:true}).click();
   await invalidPage.getByText('Este enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.',{exact:true}).waitFor();
   await invalidPage.screenshot({path:`${out}/expired-real-link-es.png`,fullPage:true});await invalidCtx.close();
   report.checks.push({case:'real recovery',requested:200,verify:303,redirect:origin+'/auth/password?recovery=1',recoverySentAt:mail.recovery_sent_at,passwordUpdate:200,loginNewPassword:200,returnPath:'/',reloadRecovery:'preserved',reuseLink:'translated expired-link error EN/ES; URL fragment cleared',mailEvidence:'real pending token via Tom DEV mailbox; email HTML not readable'});
   console.log('PASS real recovery email token, password change, return and used-link denial');
  }finally{
   if(changed){
    const restored=await request('/auth/v1/user',restoreToken,{password:accounts.owner_uno.password},'PUT');assert.equal(restored.status,200,'restore original DEV fixture password');
    report.checks.push({case:'fixture cleanup',passwordRestored:true});
    await request('/auth/v1/logout?scope=local',restoreToken);
   }
   await ctx.close();
  }
 }
 report.passed=true;report.completedAt=new Date().toISOString();
}finally{for(const token of sessions)await request('/auth/v1/logout?scope=local',token);await writeFile(`${out}/live-auth.json`,JSON.stringify(report,null,2));await browser.close();}
