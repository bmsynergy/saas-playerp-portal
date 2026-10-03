// Real DEV reads only: no venue/user/printer mutations, no intercepted APIs.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app','http://127.0.0.1:18799'].includes(origin));
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const config=await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');
const key=config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const out=process.env.SMOKE_OUTPUT_DIR??'test-results/owner-workspace-live';await mkdir(out,{recursive:true});
const report={origin,mocks:false,checks:[],errors:[]},tokens=[];
async function request(path,token,body={}){const r=await fetch(api+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};}
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
async function nav(page,width){if(width<=900)await page.getByRole('button',{name:'Open navigation',exact:true}).click();}
async function fit(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');}
try {
 for(const profile of ['owner_uno','owner_varios']) {
  const c=accounts[profile];assert(c.email.endsWith('@resend.dev'));
  const login=await request('/auth/v1/token?grant_type=password',null,{email:c.email,password:c.password});assert.equal(login.status,200,`login ${profile}`);
  const session=login.data;tokens.push(session.access_token);
  const access=await request('/rest/v1/rpc/portal_access',session.access_token);assert.equal(access.status,200);
  const venues=access.data.owner_venues;assert.equal(venues.length,profile==='owner_uno'?1:2);
  for(const width of [1440,390]) {
   const ctx=await browser.newContext({viewport:{width,height:900},locale:'en'});
   await ctx.addInitScript(({session})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale','en');localStorage.setItem('playerp.portal.venue.'+session.user.id,'obsolete-selection');},{session});
   const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',()=>report.errors.push('Browser runtime error'));
   const calls=[];page.on('request',r=>{if(r.url().includes('/rest/v1/rpc/')||r.url().includes('/functions/v1/'))calls.push(new URL(r.url()).pathname.split('/').pop());});
   await page.goto(origin+'/');await expect(page.getByRole('heading',{name:'Manage your PlayERP account.',exact:true})).toBeVisible();
   await expect(page.getByText('Manage your subscription, venues, users, features, and account settings.',{exact:true})).toBeVisible();
   if(venues.length>1) {
    await expect(page.getByTestId('owner-overview')).toBeVisible();
    await expect(page.getByTestId(/^owner-venue-tile-/)).toHaveCount(venues.length);
    for(const v of venues){const tile=page.getByTestId('owner-venue-tile-'+v.id);await expect(tile).toContainText(v.name);if(v.address)await expect(tile).toContainText(v.address);}
    assert(!calls.includes('portal_owner_venues'),'Overview must use access data only');
    await fit(page);await page.screenshot({path:`${out}/${profile}-overview-${width}.png`,fullPage:true});
    await page.getByTestId('owner-venue-tile-'+venues[0].id).click();
   }
   await expect(page.getByTestId('owner-dashboard')).toBeVisible();
   await expect(page.getByTestId('owner-overview')).toHaveCount(0);
   await expect(page.getByTestId(/^owner-venue-tile-/)).toHaveCount(0);
   await fit(page);await page.screenshot({path:`${out}/${profile}-dashboard-${width}.png`,fullPage:true});
   await nav(page,width);
   await expect(page.getByTestId('owner-venue-select')).toHaveCount(venues.length>1?1:0);
   await page.screenshot({path:`${out}/${profile}-navigation-${width}.png`,fullPage:true,animations:'disabled'});
   if(width>900){await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await expect(page.locator('.portal-layout')).toHaveClass(/sidebar-collapsed/);await page.getByRole('button',{name:'Expand navigation',exact:true}).click();}
   await page.getByTestId('owner-nav-details').click();await expect(page.locator('#venue-details-title')).toBeVisible();
   if(venues[0].address)await expect(page.locator('.owner-venue-card')).toContainText(venues[0].address);
   await page.reload();await expect(page.locator('#venue-details-title')).toBeVisible();
   await nav(page,width);await page.getByTestId('venue-users-tab').click();await expect(page.getByTestId('owner-users')).toBeVisible();
   await nav(page,width);await page.getByTestId('venue-print-servers-tab').click();await expect(page.getByTestId('ps-detail')).toBeVisible();
   await fit(page);
   if(venues.length>1) {
    await nav(page,width);await page.getByTestId('owner-venue-select').selectOption(venues[1].id);
    await expect(page.getByTestId('owner-dashboard')).toBeVisible();await expect(page.getByTestId('owner-dashboard')).toContainText(venues[1].name);
    await expect(page.getByTestId('ps-detail')).toHaveCount(0);
    await page.reload();await expect(page.getByTestId('owner-dashboard')).toContainText(venues[1].name);
    await nav(page,width);await page.getByTestId('owner-nav-overview').click();await expect(page.getByTestId('owner-overview')).toBeVisible();
    await page.goto(origin+'/');await expect(page.getByTestId('owner-overview')).toBeVisible();
   }
   await page.getByRole('button',{name:'ES',exact:true}).click();await expect(page.getByRole('heading',{name:'Gestiona tu cuenta de PlayERP.',exact:true})).toBeVisible();await fit(page);
   await page.getByRole('button',{name:'EN',exact:true}).click();
   const foreign='00000000-0000-4000-8000-000000000099';
   await page.goto(origin+`/?venue=${foreign}&section=users`);await expect(page.locator('.state-denied')).toBeVisible();await expect(page.getByTestId('owner-dashboard')).toHaveCount(0);await expect(page.getByTestId('owner-users')).toHaveCount(0);
   assert(!calls.some(n=>['portal_ps_fleet','portal_ps_inventory','portal_tenant_directory','portal_tenant_detail','platform-identity-admin'].includes(n)),'owner called a platform API');
   report.checks.push({profile,width,venues:venues.map(v=>({id:v.id,name:v.name})),entry:venues.length>1?'overview':'dashboard',navigation:'details/users/print servers, reload, EN/ES, foreign venue denied',passed:true});
   console.log(`PASS ${profile} ${width}px`);await ctx.close();
  }
  const denied=await request('/rest/v1/rpc/portal_owner_venues',session.access_token,{p_venue_id:'00000000-0000-4000-8000-000000000099'});assert.equal(denied.status,403);
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
} finally {for(const token of tokens)await request('/auth/v1/logout?scope=local',token);await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
