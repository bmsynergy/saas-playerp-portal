// PE-328 — pasada EN VIVO, solo lectura, contra el portal publicado (DEV).
// Entra con un Admin de plataforma de prueba y comprueba: la pestaña Usuarios de dos venues
// (solo sus usuarios, con su rol en cada uno), que /admin/users ya no existe ni en el menú y
// que /admin/staff sigue mostrando el staff de plataforma. No escribe nada.
// Uso: PE328_ADMIN_EMAIL=… PE328_PW=… PE328_ANON=… node tests/venue-users-live.mjs
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const email=process.env.PE328_ADMIN_EMAIL,password=process.env.PE328_PW,anon=process.env.PE328_ANON;
const A=process.env.PE328_VENUE_A??'c1700000-0000-0000-0000-0000000000a0',B=process.env.PE328_VENUE_B??'7c0f986f-2f28-4238-9080-279be48a0cc1';
const out=(process.env.SMOKE_OUTPUT_DIR??new URL('../test-results/live/',import.meta.url).pathname).replace(/\/?$/, '/');await mkdir(out,{recursive:true});
const ok=name=>console.log('PASS '+name);
const post=async(url,body,headers={})=>{const r=await fetch(url,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};};
const login=await post(api+'/auth/v1/token?grant_type=password',{email,password});assert.equal(login.status,200,'test login');
const jwt=login.data.access_token;
const members=async venue_id=>{const r=await post(api+'/functions/v1/platform-identity-admin',{action:'list',venue_id},{Authorization:'Bearer '+jwt});assert.equal(r.status,200);return r.data;};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'en'}),page=await ctx.newPage();page.setDefaultTimeout(20000);
 await page.goto(`${origin}/admin/tenants/${A}/users`);
 await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.locator('a.nav-link').first().waitFor();
 const emailsOf=async()=>{await page.getByTestId('venue-users').waitFor();await page.getByTestId('venue-user-row').first().waitFor();return (await page.getByTestId('venue-user-row').allInnerTexts()).map(t=>t.replace(/\s+/g,' '));};
 for(const [name,venue] of [['A',A],['B',B]]){
  await page.goto(`${origin}/admin/tenants/${venue}/users`);
  const expected=await members(venue),rows=await emailsOf();
  assert.equal(rows.length,expected.users.length,`venue ${name}: row count`);
  for(const u of expected.users)assert(rows.some(r=>r.includes(u.email)),`venue ${name}: ${u.email} listed`);
  console.log(`  venue ${name} «${expected.venue.name}»: ${expected.users.map(u=>`${u.email}=${u.role}`).join(', ')}`);
  await page.screenshot({path:`${out}venue-users-${name}.png`,fullPage:true});
  ok(`Users tab of venue ${name} lists exactly its ${rows.length} members`);
 }
 const a=await members(A),b=await members(B);
 const dual=a.users.find(u=>b.users.some(x=>x.user_id===u.user_id&&x.role!==u.role));
 assert(dual,'one account in both venues with different roles');ok(`Same account, different role per venue: ${dual.email} → ${dual.role} in A, ${b.users.find(x=>x.user_id===dual.user_id).role} in B`);
 const onlyA=a.users.filter(u=>!b.users.some(x=>x.user_id===u.user_id)).map(u=>u.email);
 await page.goto(`${origin}/admin/tenants/${B}/users`);const rowsB=await emailsOf();
 for(const e of onlyA)assert(!rowsB.some(r=>r.includes(e)),`${e} must not appear in B`);ok(`Members only of A (${onlyA.length}) do not appear in the Users tab of B`);
 const nav=await page.locator('a.nav-link').evaluateAll(els=>els.map(e=>e.getAttribute('href')));
 assert(!nav.some(h=>h?.startsWith('/admin/users')),'no /admin/users in menu');assert(nav.includes('/admin/staff'),'staff in menu');ok(`Menu: ${nav.join(' ')} (no /admin/users)`);
 for(const path of ['/admin/users','/admin/users/'+dual.user_id]){await page.goto(origin+path);await page.waitForURL(u=>new URL(u).pathname==='/admin/tenants');ok(`${path.replace(dual.user_id,':id')} redirects to /admin/tenants (no global list)`);}
 await page.goto(origin+'/admin/staff');await page.getByRole('heading',{name:'Staff management',exact:true}).waitFor();
 await page.getByRole('row').filter({hasText:email}).first().waitFor();
 assert.equal(await page.getByRole('row').filter({hasText:dual.email}).count(),0,'venue user not in platform staff');
 await page.screenshot({path:`${out}platform-staff.png`,fullPage:true});ok('/admin/staff still lists platform staff (and no venue users)');
 console.log('ALL PASS');
}finally{await browser.close();}
