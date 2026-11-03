// One acceptance pass, real DEV fixtures and RPCs, no data mutations.
import {chromium, expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN||'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app','http://127.0.0.1:18791'].includes(origin));
const out=process.env.LIVE_OUTPUT_DIR||'docs/evidence/pe5704';
await mkdir(out,{recursive:true});
const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
const defaults=await readFile(new URL('../build/dev-defaults.ts',import.meta.url),'utf8');
const key=defaults.match(/SUPABASE_PUBLIC_KEY\s*=\s*['"]([^'"]+)/)[1];
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const login=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:accounts.staff_activo.email,password:accounts.staff_activo.password})});
assert.equal(login.status,200);const session=await login.json();
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},session);
const page=await context.newPage();page.setDefaultTimeout(30000);
const report={origin,at:new Date().toISOString(),mocked:false,mutations:false,errors:[],requests:[],criteria:{}};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('response',r=>{
 if(!/\/rpc\/portal_maintenance_venue_(list|runs)$/.test(r.url()))return;
 // Log request metadata synchronously: a reload may release the response body in Chromium.
 report.requests.push({rpc:r.url().split('/').at(-1),request:r.request().postDataJSON(),status:r.status()});
});
const response=(name,predicate=()=>true)=>page.waitForResponse(r=>r.url().endsWith('/rpc/'+name)&&r.status()===200&&predicate(r.request().postDataJSON()));
const list=(predicate)=>response('portal_maintenance_venue_list',predicate);
const runs=(predicate)=>response('portal_maintenance_venue_runs',predicate);
const style=locator=>locator.evaluate(el=>{const read=node=>{const s=getComputedStyle(node);return {tag:node.tagName,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,boxShadow:s.boxShadow};};return {element:read(el),container:read(el.parentElement),focused:document.activeElement===el,nav:document.documentElement.dataset.nav??null,tabindex:el.getAttribute('tabindex')};});
const noRing=s=>{for(const x of [s.element,s.container]){assert(x.outlineStyle==='none'||x.outlineWidth==='0px',JSON.stringify(s));assert.equal(x.boxShadow,'none',JSON.stringify(s));}};
const compact = data => ({total:data.total,page:data.page,pages:data.pages,rows:data.venues.length,problemNights:data.venues.map(v=>v.problem_nights),summary:data.summary});
const readList = async (action,predicate=()=>true) => {const pending=list(predicate);await action();const data=await(await pending).json();await expect(page.getByTestId('maintenance-pagination-range')).toContainText(String(data.total));await expect(page.getByTestId('maintenance-venue-row')).toHaveCount(data.venues.length);return data;};
const cards=page.locator('.maintenance-summary button');
const show=page.getByTestId('maintenance-show');
try {
 const first=await readList(()=>page.goto(origin+'/admin/maintenance'));
 assert.equal(first.total,133);const summary=first.summary;
 const expected={all:summary.venues,problem:summary.venues_with_problems,last_night_problem:summary.venues_last_night_problem,ok:summary.venues-summary.venues_with_problems};
 report.criteria[1]={summary,options:{all:compact(first)}};
 for(const status of ['problem','last_night_problem','ok']) {
   const data=await readList(()=>show.selectOption(status),p=>p.p_status===status&&p.p_page===1);
   assert.equal(data.total,expected[status]);assert.deepEqual(data.summary,summary);
   report.criteria[1].options[status]=compact(data);
 }
 const second=await readList(()=>page.getByTestId('maintenance-pagination-next').click(),p=>p.p_status==='ok'&&p.p_page===2);
 assert.equal(second.total,expected.ok);assert.equal(second.venues.length,25);assert(second.venues.every(v=>v.problem_nights===0));
 report.criteria[1].okPage2=compact(second);
 report.criteria[2]={cards:[]};
 for(const [index,status] of [[1,'problem'],[2,'last_night_problem'],[3,'problem'],[0,'all']]) {
   const card=cards.nth(index);
   const data=await readList(()=>card.click(),p=>p.p_status===status&&p.p_page===1);
   await expect(card).toHaveAttribute('aria-pressed','true');await expect(show).toHaveValue(status);
   assert.equal(new URL(page.url()).searchParams.get('show'),status);
   const focus=await style(card);noRing(focus);
   const count=Number(await card.locator('strong').textContent());
   const sum=data.venues.reduce((n,v)=>n+v.problem_nights,0);
   if(index===3) {assert.equal(sum,count);assert.equal(data.total,summary.venues_with_problems);const column=await page.locator('.maintenance-venue-row .maintenance-venue-metric strong').allTextContents();assert.equal(column.reduce((n,v)=>n+Number(v),0),count);} else assert.equal(data.total,count);
   assert.deepEqual(data.summary,summary);
   report.criteria[2].cards.push({index,status,count,total:data.total,sumProblemNights:sum,ariaPressed:await card.getAttribute('aria-pressed'),focus,url:page.url()});
 }
 const filtered=await readList(()=>show.selectOption('problem'),p=>p.p_status==='problem');
 const reloaded=await readList(()=>page.reload(),p=>p.p_status==='problem');
 assert.equal(reloaded.total,filtered.total);await expect(show).toHaveValue('problem');
 await expect(cards.nth(1)).toHaveAttribute('aria-pressed','true');await expect(cards.nth(3)).toHaveAttribute('aria-pressed','true');
 report.criteria[3]={url:page.url(),before:filtered.total,after:reloaded.total,show:await show.inputValue(),activeCards:[await cards.nth(1).getAttribute('aria-pressed'),await cards.nth(3).getAttribute('aria-pressed')]};
 await page.screenshot({path:out+'/filtered-reloaded.png',fullPage:true});
 const searched=await readList(()=>page.getByTestId('maintenance-venue-search').fill('QA-120'),p=>p.p_query==='QA-120'&&p.p_status==='problem');
 assert.equal(searched.total,7);assert.deepEqual(searched.summary,summary);report.search=compact(searched);
 const invalid=await readList(()=>page.goto(origin+'/admin/maintenance?show=invalid'),p=>p.p_status==='all');
 assert.equal(invalid.total,133);await expect(show).toHaveValue('all');await expect(cards.nth(0)).toHaveAttribute('aria-pressed','true');report.invalidUrl={total:invalid.total,show:await show.inputValue()};
 await cards.nth(0).focus();await page.keyboard.press('Tab');
 const keyboard=await style(cards.nth(1));assert.equal(keyboard.nav,'keyboard');assert.notEqual(keyboard.element.outlineStyle,'none');report.keyboard=keyboard;
 await page.setViewportSize({width:390,height:844});await expect(show).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/mobile.png',fullPage:false});report.mobile={width:390,overflow:false};
 assert.deepEqual(report.errors,[]);report.ok=true;console.log(JSON.stringify(report,null,2));
} catch(error) {report.ok=false;report.failure=String(error.stack||error);await page.screenshot({path:out+'/failure.png',fullPage:true});throw error;}
finally {await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
