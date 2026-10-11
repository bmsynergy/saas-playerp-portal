// Synthetic browser contract checks; no real credentials or OAuth approvals.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'http://127.0.0.1:18799';
const output = process.env.CONSENT_OUTPUT ?? 'test-results/oauth-consent';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const rid='abcdef01-2345-4678-9123-abcdef012345', uid='11111111-1111-4111-8111-111111111111';
const v1='22222222-2222-4222-8222-222222222222',v2='33333333-3333-4333-8333-333333333333';
const user={id:uid,email:'consent-fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T10:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated'})}.synthetic-not-valid`,refresh_token:'synthetic-not-valid',expires_in:3600,expires_at:exp,token_type:'bearer',user};
const venues=[{venue_id:v1,nombre:'Sample Harbor',concedida:true},{venue_id:v2,nombre:'Sample Garden',concedida:true}];
const records=[],errors=[];
const pass=name=>{records.push(name);console.log('PASS '+name);};
async function setup({auth=true,width=1440,lang='en',list=venues,contextError=null,decisionError=null,redirect='https://client.example/callback?code=synthetic',mixed=false,delay=0,contextOverride=null}={}) {
  const ctx=await browser.newContext({viewport:{width,height:1000},locale:lang});
  const requests=[];
  await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.locale',lang);if(session)localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));},{session:auth?session:null,lang});
  await ctx.route('https://client.example/**',r=>r.fulfill({contentType:'text/html',body:'<p>Intercepted synthetic callback</p>'}));
  // Intercept every backend request: synthetic sessions never reach the real server.
  await ctx.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const body=req.postData()?req.postDataJSON():null;requests.push({path,body});
    const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(path==='/auth/v1/token')return send(session);
    if(path==='/auth/v1/user')return send(user);
    if(path==='/auth/v1/logout')return send({});
    if(path.endsWith('/is_platform_staff'))return send(mixed);
    if(path.endsWith('/portal_access'))return send({is_platform_staff:mixed,owner_venues:[{id:v1,name:'Sample Harbor'}]});
    if(path.endsWith('/mcp_consent_context'))return contextError?send({message:contextError,code:contextError==='expired-session'?'PGRST301':'22023'},400):send(contextOverride??{request_id:rid,client:{id:'fixture',name:'Sample assistant',redirect_host:'client.example'},venues:list});
    if(path.endsWith('/mcp_consent_decide')) {
      if(delay)await new Promise(r=>setTimeout(r,delay));
      return decisionError?send({message:decisionError+': private internal detail',code:'42501'},403):send({redirect_to:redirect});
    }
    errors.push('Unexpected API '+path);return send({message:'Unexpected synthetic request'},500);
  });
  const page=await ctx.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  return {ctx,page,requests};
}
const open=page=>page.goto(origin+`/oauth/consent?request_id=${rid}`);
const allow=page=>page.getByRole('button',{name:'Allow',exact:true});
try {
  {
    const {ctx,page,requests}=await setup({auth:false});
    for(const query of ['', '?request_id=bad', `?request_id=${rid}&request_id=${rid}`]) {
      await page.goto(origin+'/oauth/consent'+query);await page.getByRole('alert').waitFor();
      assert.match(await page.getByRole('alert').innerText(),/not valid/);
    }
    assert.equal(requests.length,0);
    pass('Missing, malformed and duplicate requests fail before Auth/RPC');await ctx.close();
  }
  for(const mixed of [false,true]) {
    const {ctx,page,requests}=await setup({auth:false,mixed});
    await page.goto(origin+`/oauth/consent?request_id=${rid.toUpperCase()}&redirect_uri=https://evil.invalid`);
    await page.getByLabel('Email address',{exact:true}).fill(user.email);
    assert.equal(new URL(page.url()).searchParams.get('next'),`/oauth/consent?request_id=${rid}`);
    await page.getByLabel('Password',{exact:true}).fill('synthetic-password-only');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('radio').first().waitFor();
    assert.equal(new URL(page.url()).pathname,'/oauth/consent');
    assert(requests.some(r=>r.path.endsWith('/mcp_consent_context')&&r.body.p_request_id===rid));
    pass(`Anonymous login retains normalized request (${mixed?'mixed owner/staff':'owner'})`);await ctx.close();
  }
  for(const width of [390,1440]) for(const lang of ['en','es']) {
    const {ctx,page,requests}=await setup({width,lang});await open(page);
    const radios=page.getByRole('radio');await radios.first().waitFor();
    assert.equal(await page.locator('input[type=radio]:checked').count(),0);
    const approve=page.getByRole('button',{name:lang==='es'?'Permitir':'Allow',exact:true});
    assert(await approve.isDisabled());await radios.first().check();assert(await approve.isDisabled());
    await page.getByRole('checkbox').check();assert(await approve.isEnabled());
    await radios.nth(1).check();assert.equal(await page.locator('input[type=radio]:checked').count(),1);
    assert(!(await page.getByRole('checkbox').isChecked()));assert(await approve.isDisabled());
    assert.match(await page.locator('.oauth-confirm').innerText(),/Sample Garden/);
    await page.getByRole('checkbox').check();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${output}/single-venue-${width}-${lang}.png`,fullPage:true});
    await approve.click();await page.waitForURL('https://client.example/**');
    const decisions=requests.filter(r=>r.path.endsWith('/mcp_consent_decide'));
    assert.equal(decisions.length,1);assert.deepEqual(decisions[0].body,{p_request_id:rid,p_approve:true,p_venue_ids:[v2]});
    pass(`Explicit single venue + re-confirm selection + exact RPC payload ${width}px ${lang}`);await ctx.close();
  }
  {
    const {ctx,page}=await setup({list:[venues[0]]});await open(page);await page.getByRole('radio').waitFor();
    assert(!(await page.getByRole('radio').isChecked()));assert(await allow(page).isDisabled());
    pass('Only one available/prior venue still needs explicit selection');await ctx.close();
  }
  {
    const {ctx,page,requests}=await setup({list:[]});await open(page);await page.getByRole('alert').waitFor();assert(await allow(page).isDisabled());
    await page.getByRole('button',{name:'Deny',exact:true}).click();await page.waitForURL('https://client.example/**');
    assert.deepEqual(requests.find(r=>r.path.endsWith('/mcp_consent_decide')).body,{p_request_id:rid,p_approve:false,p_venue_ids:null});
    pass('No owned venues: cannot allow; denial sends no venues');await ctx.close();
  }
  const contextErrors={mcp_request_unknown:/does not exist/,mcp_request_expired:/expired/,mcp_request_already_decided:/already been answered/,mcp_consent_denied:/Sign in/, 'network-fixture':/could not be loaded/};
  for(const [contextError,expected] of Object.entries(contextErrors)) {
    const {ctx,page}=await setup({contextError});await open(page);await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),expected);
    assert.equal(await page.getByRole('radio').count(),0);await ctx.close();
  }
  pass('Unknown/expired/decided requests, missing session and loading errors are readable and fail closed');
  {
    const {ctx,page}=await setup({contextError:'expired-session'});await open(page);
    await page.getByLabel('Email address',{exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('next'),`/oauth/consent?request_id=${rid}`);
    assert.equal(await page.evaluate(()=>localStorage.getItem('playerp.portal.dev.auth')),null);
    pass('RPC session rejection clears local session and preserves request through login');await ctx.close();
  }

  const decisionErrors={mcp_piloto_owner_no_permitido:/account cannot connect/,mcp_piloto_una_sola_sede:/just one venue/,mcp_piloto_sede_no_permitida:/not enabled for the pilot/,mcp_consent_not_owner:/venues you own/, 'network-fixture':/could not be saved/};
  for(const [decisionError,expected] of Object.entries(decisionErrors)) {
    const {ctx,page}=await setup({decisionError});await open(page);await page.getByRole('radio').first().check();await page.getByRole('checkbox').check();await allow(page).click();
    await page.getByRole('alert').waitFor();const message=await page.getByRole('alert').innerText();assert.match(message,expected);assert(!message.includes('private internal detail'));
    await ctx.close();
  }
  pass('Pilot/ownership and save errors translated without raw server details');
  {
    const {ctx,page,requests}=await setup({delay:600,decisionError:'mcp_piloto_owner_no_permitido'});await open(page);await page.getByRole('radio').first().check();await page.getByRole('checkbox').check();
    await allow(page).evaluate(b=>{b.click();b.click();});assert(await allow(page).isDisabled());assert(await page.getByRole('radio').first().isDisabled());
    await page.getByRole('alert').waitFor();assert.equal(requests.filter(r=>r.path.endsWith('/mcp_consent_decide')).length,1);
    pass('Double click produces one decision and locks the selected venue while pending');await ctx.close();
  }
  {
    const {ctx,page}=await setup({redirect:'javascript:alert(1)'});await open(page);await page.getByRole('button',{name:'Deny',exact:true}).click();await page.getByRole('alert').waitFor();
    assert.match(page.url(),/\/oauth\/consent/);assert.equal(await page.getByRole('radio').count(),0);
    pass('Unsafe returned redirect is rejected');await ctx.close();
  }
  {
    const {ctx,page}=await setup();await open(page);await page.getByRole('radio').first().check();await page.getByRole('checkbox').check();
    await page.evaluate(()=>{localStorage.removeItem('playerp.portal.dev.auth');window.dispatchEvent(new StorageEvent('storage',{key:'playerp.portal.dev.auth',newValue:null}));});
    await page.getByLabel('Email address',{exact:true}).waitFor();assert.equal(await page.getByRole('radio').count(),0);
    pass('Session removal discards consent and returns to login');await ctx.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/results.json`,JSON.stringify({origin,mode:'synthetic Auth/RPC; no real account',passed:records.length,records,browserErrors:errors},null,2));
} finally { await browser.close(); }
