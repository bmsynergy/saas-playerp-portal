// Opt-in acceptance checks against PlayERP-dev. Credentials stay in memory.
// Uses only test accounts provided by Tom; never changes memberships or business data.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.env.PORTAL_TEST_ORIGIN ?? 'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app','http://127.0.0.1:18799'].includes(origin));
const privateDir = process.env.PORTAL_DEV_FIXTURES;
assert(privateDir, 'Set PORTAL_DEV_FIXTURES to the private fixture directory from Tom');
const accounts = JSON.parse(await readFile(`${privateDir}/cuentas.json`, 'utf8'));
const config = await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');
const api = 'https://fzwzmwstxlsxdzdmphyq.supabase.co';
assert(config.includes(api));
const key = config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];
const out = process.env.LIVE_OUTPUT_DIR ?? new URL('../test-results/live/', import.meta.url).pathname;
await mkdir(out,{recursive:true});
const report = {origin, project:'fzwzmwstxlsxdzdmphyq', startedAt:new Date().toISOString(), mocks:false, api:[], ui:[], screenshots:[], pageErrors:[]};
const storageKey = 'playerp.portal.dev.auth';
const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const sessions=[];
async function request(path, token, body, method='POST') {
  const response=await fetch(api+path,{method,headers:{apikey:key,Authorization:`Bearer ${token??key}`,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
  const text=await response.text(); let data;try {data=JSON.parse(text);}catch{data=null;}
  return {status:response.status,data};
}
async function loginApi(profile) {
  const account=accounts[profile]; assert(account.email.endsWith('@resend.dev'));
  const result=await request('/auth/v1/token?grant_type=password',null,{email:account.email,password:account.password});
  assert.equal(result.status,200,`login ${profile}: ${result.data?.code??result.status}`);
  sessions.push(result.data.access_token);return result.data;
}
const rpc=(name,token,body={})=>request(`/rest/v1/rpc/${name}`,token,body);
const heading=(page,name)=>page.getByRole('heading',{name,exact:true}).waitFor();
async function context(width=1440) {
  const ctx=await browser.newContext({viewport:{width,height:1000},locale:'en'});
  const page=await ctx.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>report.pageErrors.push(e.message.replace(/eyJ[\w.-]+/g,'[redacted]')));
  return {ctx,page};
}
async function loginUi(page,profile,path='/') {
  await page.goto(origin+path);await heading(page,'Sign in to your workspace');
  await page.getByLabel('Email address',{exact:true}).fill(accounts[profile].email);
  await page.getByLabel('Password',{exact:true}).fill(accounts[profile].password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
}
async function snapshot(page,name) {
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow: ${name}`);
  await page.screenshot({path:`${out}/${name}.png`,fullPage:true});report.screenshots.push(name+'.png');
}
async function logoutUi(page,lang='en') {
  if(await page.locator('.portal-layout').count()) {
    await page.locator('.account-trigger').click();
    await page.getByRole('menuitem',{name:lang==='en'?'Sign out':'Cerrar sesión',exact:true}).click();
  } else await page.getByRole('button',{name:lang==='en'?'Sign out':'Cerrar sesión',exact:true}).click();
  await heading(page,lang==='en'?'Sign in to your workspace':'Accede a tu espacio');
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),storageKey),null);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('playerp.portal.venue.')).length),0);
}
try {
  const staff=await loginApi('staff_activo');
  const directory=await rpc('portal_tenant_directory',staff.access_token);assert.equal(directory.status,200);
  const foreign=directory.data.find(v=>v.slug==='adventure-park-demo');assert(foreign);
  const venueKeys=['id','name','slug','city','state','address','phone','email','timezone','is_active'].sort();
  for(const v of directory.data)assert.deepEqual(Object.keys(v).sort(),venueKeys);
  const detail=await rpc('portal_tenant_detail',staff.access_token,{p_venue_id:foreign.id});assert.equal(detail.status,200);
  assert.deepEqual(Object.keys(detail.data).sort(),['print_servers','venue']);
  assert.deepEqual(Object.keys(detail.data.venue).sort(),venueKeys);
  for(const s of detail.data.print_servers)assert.deepEqual(Object.keys(s).sort(),['id','venue_id','software_version','last_seen_at','status'].sort());
  const sample=detail.data.print_servers.find(s=>s.status==='active');assert(sample);
  const noData=detail.data.print_servers.find(s=>s.software_version===null&&s.last_seen_at===null);assert(noData);
  report.sample={tenant:{id:foreign.id,name:foreign.name,slug:foreign.slug},print_servers:[sample,noData],directoryCount:directory.data.length,allowedVenueKeys:venueKeys,allowedServerKeys:Object.keys(sample).sort()};
  const missing=await rpc('portal_tenant_detail',staff.access_token,{p_venue_id:'00000000-0000-4000-8000-000000000000'});assert.equal(missing.data,null);
  const profiles=['anon',...Object.keys(accounts)];
  const expectedOwners={owner_uno:['wi170p1-venue'],owner_varios:['us-test-venue-fl','wi170p1-venue']};
  for(const profile of profiles) {
    const session=profile==='anon'?null:profile==='staff_activo'?staff:await loginApi(profile);
    const token=session?.access_token;
    const access=await rpc('portal_access',token);
    const owner=await rpc('portal_owner_venues',token);
    const other=await rpc('portal_owner_venues',token,{p_venue_id:foreign.id});
    const dir=await rpc('portal_tenant_directory',token);
    const tenant=await rpc('portal_tenant_detail',token,{p_venue_id:foreign.id});
    const direct=await request('/rest/v1/print_servers?select=id,venue_id,software_version,last_seen_at,status',token,null,'GET');
    const anonymous=profile==='anon',isStaff=profile==='staff_activo',own=expectedOwners[profile];
    assert.equal(access.status,anonymous?401:200);
    if(!anonymous){assert.equal(access.data.is_platform_staff,isStaff);assert.deepEqual(access.data.owner_venues.map(v=>v.slug).sort(),own??[]);}
    assert.equal(owner.status,anonymous?401:own?200:403);
    if(own)assert.deepEqual(owner.data.map(v=>v.slug).sort(),own);
    assert.equal(other.status,anonymous?401:403);assert.equal(dir.status,anonymous?401:isStaff?200:403);
    assert.equal(tenant.status,anonymous?401:isStaff?200:403);assert.equal(direct.status,anonymous?401:403);
    report.api.push({profile,access:access.status,platformStaff:access.data?.is_platform_staff??false,owner:owner.status,ownerVenues:own??[],foreignVenue:other.status,directory:dir.status,detail:tenant.status,printServersTable:direct.status});
    console.log(`PASS API ${profile}`);
  }
  {
    const {ctx,page}=await context();
    for(const path of ['/','/admin',`/admin/tenants/${foreign.id}`]){
      const response=await page.goto(origin+path);assert.equal(response.status(),200);await heading(page,'Sign in to your workspace');
      const reload=await page.reload();assert.equal(reload.status(),200);await heading(page,'Sign in to your workspace');
      report.ui.push({profile:'anon',path,http:200,reload:'login'});
    }
    await snapshot(page,'login-1440-en');await page.setViewportSize({width:834,height:1000});
    await page.getByRole('button',{name:'ES',exact:true}).click();await page.reload();await heading(page,'Accede a tu espacio');await snapshot(page,'login-834-es');
    await ctx.close();
  }
  for(const profile of Object.keys(accounts)) {
    const {ctx,page}=await context();
    const owner=expectedOwners[profile],isStaff=profile==='staff_activo';
    await loginUi(page,profile,isStaff?'/admin':'/');
    await heading(page,isStaff?'A clear view across PlayERP.':owner?'Your spaces, in one place.':'Access denied');
    await page.reload();await heading(page,isStaff?'A clear view across PlayERP.':owner?'Your spaces, in one place.':'Access denied');
    if(owner) {
      const shown=await page.locator('.owner-venue-top h2').innerText();assert(shown);
      if(owner.length>1){
        const select=page.getByLabel('Select a venue',{exact:true});
        assert.equal(await select.locator('option').count(),2);
        const options=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>({id:n.value,name:n.textContent})));
        const previous=await select.inputValue(),next=options.find(v=>v.id!==previous);
        await select.selectOption(next.id);await heading(page,next.name);await page.reload();await heading(page,next.name);assert.equal(await select.inputValue(),next.id);
        await snapshot(page,'owner-multiple-1440-en');await page.setViewportSize({width:834,height:1000});await page.getByRole('button',{name:'ES',exact:true}).click();await page.reload();await heading(page,'Tus espacios, en un solo lugar.');await snapshot(page,'owner-multiple-834-es');await page.getByRole('button',{name:'EN',exact:true}).click();
      }
      await page.goto(origin+`/?venue=${foreign.id}`);await heading(page,'Access denied');assert.equal(await page.locator('.owner-venue-card').count(),0);
    }
    if(!isStaff){
      await page.goto(origin+'/admin');await heading(page,owner?'Your spaces, in one place.':'Access denied');
      await page.goto(origin+`/admin/tenants/${foreign.id}`);await heading(page,owner?'Your spaces, in one place.':'Access denied');
      await snapshot(page,`denied-${profile}`);
    }else{
      await snapshot(page,'admin-1440-en');
      await page.getByRole('link',{name:'Browse directory',exact:true}).click();await heading(page,'Tenant directory');
      await page.getByRole('searchbox').fill('no-such-tenant-pe321');await heading(page,'No venues match your search.');
      await page.getByRole('searchbox').fill(foreign.slug);assert.equal(await page.locator('.directory-row').count(),1);await snapshot(page,'directory-search-1440-en');
      await page.locator('.directory-row').click();await heading(page,foreign.name);await page.reload();await heading(page,foreign.name);
      const activeRow=page.getByRole('row').filter({hasText:sample.id});await activeRow.getByText(sample.software_version,{exact:true}).waitFor();
      assert.equal(await page.locator('tbody tr').count(),detail.data.print_servers.length);
      await page.getByRole('row').filter({hasText:noData.id}).getByText('Not provided',{exact:true}).waitFor();
      await snapshot(page,'detail-1440-en');await page.setViewportSize({width:834,height:1000});await page.getByRole('button',{name:'ES',exact:true}).click();await page.reload();await heading(page,foreign.name);await snapshot(page,'detail-834-es');
      await page.getByRole('button',{name:'EN',exact:true}).click();
      const empty=directory.data.find(v=>v.slug==='wi170p1-venue');await page.goto(origin+`/admin/tenants/${empty.id}`);await heading(page,empty.name);await page.getByText('No Print Servers are linked to this venue.',{exact:true}).waitFor();
      await snapshot(page,'servers-empty');
      await page.goto(origin+'/');await heading(page,'A clear view across PlayERP.');
    }
    await logoutUi(page);await page.reload();await heading(page,'Sign in to your workspace');
    report.ui.push({profile,login:'pass',reload:'persisted',root:isStaff?'denied':owner?'authorized venues only':'denied',admin:isStaff?'authorized':'denied',foreignVenue:owner?'denied':'not applicable',selection:owner?.length>1?'changed and persisted':'not applicable',logout:'Auth and selection cleared; reload login'});
    await ctx.close();console.log(`PASS UI ${profile}`);
  }
  assert.deepEqual(report.pageErrors,[]);report.completedAt=new Date().toISOString();report.passed=true;
} finally {
  for(const token of sessions)await request('/auth/v1/logout?scope=local',token);
  await writeFile(`${out}/live-dev.json`,JSON.stringify(report,null,2));await browser.close();
}
console.log('PASS live DEV matrix; sanitized report saved');
