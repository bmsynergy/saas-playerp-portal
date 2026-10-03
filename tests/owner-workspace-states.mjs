// Synthetic fixtures for rare UI states, not live authorization evidence.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
const out=process.env.SMOKE_OUTPUT_DIR??'test-results/owner-workspace-states';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const U='11111111-1111-4111-8111-111111111111',A='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
const venues=[{id:A,name:'Harbor',city:'San Juan',address:'123 Test Street',is_active:true,is_owner:true},{id:B,name:'Garden',city:null,address:null,is_active:null,is_owner:false}];
const user={id:U,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-02T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={user,access_token:`${enc({alg:'HS256'})}.${enc({sub:U,exp,aud:'authenticated',role:'authenticated',session_id:U})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer'};
const report={origin,mocks:true,checks:[],errors:[]};
function pass(name){report.checks.push(name);console.log('PASS '+name);}
async function setup(mode='ready',width=390){
 const ctx=await browser.newContext({viewport:{width,height:900},locale:'en'});
 await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','en');},session);
 const db={mode,calls:[]};
 await ctx.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**',async route=>{
  const r=route.request(),url=new URL(r.url()),name=url.pathname.split('/').pop();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  const body=r.postDataJSON()??{};db.calls.push({name,body});
  if(name==='is_platform_staff')return send(false);
  if(name==='portal_access'){
   if(db.mode==='loading')await new Promise(resolve=>db.release=resolve);
   if(db.mode==='error')return send({message:'RAW_BACKEND_SECRET'},500);
   return send({is_platform_staff:false,owner_venues:db.mode==='empty'?[]:venues});
  }
  if(name==='portal_owner_venues'){
   if(db.mode==='detail-error')return send({message:'RAW_BACKEND_SECRET'},500);
   if(db.mode==='detail-empty')return send([]);
   return send(venues.filter(v=>v.id===body.p_venue_id));
  }
  report.errors.push('Unexpected API '+name);return send({code:'unexpected'},500);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));return {ctx,page,db};
}
try{
 for(const mode of ['loading','error','empty']){
  const {ctx,page,db}=await setup(mode);await page.goto(origin+'/');
  if(mode==='loading'){await expect(page.locator('.state-loading')).toBeVisible();await expect.poll(()=>typeof db.release).toBe('function');db.mode='ready';db.release();await expect(page.getByTestId('owner-overview')).toBeVisible();}
  if(mode==='error'){await expect(page.locator('.state-error')).toBeVisible();await expect(page.locator('body')).not.toContainText('RAW_BACKEND_SECRET');db.mode='ready';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByTestId('owner-overview')).toBeVisible();}
  if(mode==='empty'){await expect(page.locator('.state-denied')).toBeVisible();await expect(page.getByTestId(/^owner-venue-tile-/)).toHaveCount(0);assert(!db.calls.some(c=>c.name==='portal_owner_venues'));}
  pass(`Access ${mode}: safe coherent state${mode==='empty'?' without invented venues':' and recovery'}`);await ctx.close();
 }
 for(const mode of ['detail-error','detail-empty']){
  const {ctx,page,db}=await setup(mode);await page.goto(origin+`/?venue=${A}`);
  await expect(page.locator(mode==='detail-error'?'.state-error':'.state-denied')).toBeVisible();
  if(mode==='detail-error'){await expect(page.locator('body')).not.toContainText('RAW_BACKEND_SECRET');db.mode='ready';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByTestId('owner-dashboard')).toBeVisible();}
  pass(`${mode}: scoped venue does not show stale or unauthorized data`);await ctx.close();
 }
 for(const width of [1440,390]) {
  const {ctx,page,db}=await setup('ready',width);await page.goto(origin+'/');
  const card=page.getByTestId('owner-venue-tile-'+B);await expect(card.locator('.status-unknown')).toHaveText('Not provided');await expect(card).toContainText('Not provided');
  await expect(page.locator('main')).not.toContainText(/\$|Print Server|Premium|Free plan|0 users/);
  await card.click();await expect(page.getByTestId('owner-dashboard')).toContainText('Garden');
  const open=async()=>{if(width<=900)await page.getByRole('button',{name:'Open navigation',exact:true}).click();};
  await open();await expect(page.getByTestId('venue-users-tab')).toHaveCount(0);await expect(page.getByTestId('owner-venue-select')).toHaveCount(1);
  if(width<=900){await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open navigation',exact:true})).toBeFocused();}
  await page.goto(origin+`/?venue=${B}&section=users`);await expect(page.locator('.state-denied')).toBeVisible();assert(!db.calls.some(c=>c.name==='owner-venue-users'));
  const foreign='99999999-9999-4999-8999-999999999999';await page.goto(origin+`/?venue=${foreign}`);await expect(page.locator('.state-denied')).toBeVisible();assert(!db.calls.some(c=>c.body.p_venue_id===foreign));
  await page.goto(origin+`/?venue=${A}`);await expect(page.getByTestId('owner-dashboard')).toBeVisible();await open();await page.getByTestId('owner-venue-select').selectOption(B);await expect(page.getByTestId('owner-dashboard')).toContainText('Garden');await page.goBack();await expect(page.getByTestId('owner-dashboard')).toContainText('Harbor');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  pass(`Missing values, approved member rights, foreign denial, browser history and mobile drawer ${width}px`);await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
