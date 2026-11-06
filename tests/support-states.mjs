// Synthetic responses exercise loading/error/empty/permission states, not live authorization.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN||'http://127.0.0.1:18791';
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const U='11111111-1111-4111-8111-111111111111',A='22222222-2222-4222-8222-222222222222';
const user={id:U,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-02T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={user,access_token:`${enc({alg:'HS256'})}.${enc({sub:U,exp,aud:'authenticated',role:'authenticated',session_id:U})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer'};
const report={mocks:true,checks:[],errors:[]};const out='test-results/support-states';await mkdir(out,{recursive:true});
try{
for(const kind of ['support','operations','owner']){
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},session);
 let mode='loading',release;const calls=[];
 await context.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  calls.push(name);
  if(name==='is_platform_staff')return send(kind!=='owner');
  if(name==='portal_access')return send({is_platform_staff:false,support_staff:kind==='support',platform_role:kind==='owner'?null:kind,owner_venues:kind==='owner'?[{id:A,name:'Fixture venue',is_owner:true}]:[]});
  if(name==='support_assignable_staff')return send([]);
  if(name==='support_venue_counts')return send({totals:{active:0,pending:0,unread:0},venues:[]});
  if(name==='support_ticket_list'){
   if(mode==='loading')await new Promise(resolve=>release=resolve);
   if(mode==='error')return send({message:'RAW_BACKEND_SECRET'},500);
   return send({scope:'platform',items:[],total:0,pages:0,page:1,page_size:25,summary:{}});
  }
  if(name==='portal_owner_venues')return send([{id:A,name:'Fixture venue',is_owner:true}]);
  report.errors.push('Unexpected '+name);return send({},500);
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin+'/admin/support');
 if(kind==='support'){
  await expect(page.getByText('Cargando casos…')).toBeVisible();await expect.poll(()=>typeof release).toBe('function');mode='empty';release();await expect(page.getByText('Todavía no hay casos de soporte.')).toBeVisible();
  assert(!calls.includes('portal_tenant_directory'));report.checks.push('Support without legacy admin can open inbox; loading and empty states');
  mode='error';await page.reload();await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('body')).not.toContainText('RAW_BACKEND_SECRET');mode='empty';await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.getByText('Todavía no hay casos de soporte.')).toBeVisible();
  report.checks.push('Error is safe and retry recovers');await page.screenshot({path:out+'/empty-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }else{await expect(page.getByTestId('support-page')).toHaveCount(0);await page.waitForTimeout(300);assert(!calls.includes('support_ticket_list'));report.checks.push(kind+' denied admin Support without querying tickets');}
 await context.close();
}
assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.failure=e.message;process.exitCode=1;}
finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
