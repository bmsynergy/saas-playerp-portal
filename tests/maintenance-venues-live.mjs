// One acceptance pass, real DEV fixtures and RPCs, no data mutations.
import {chromium, expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN||'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app','http://127.0.0.1:18791'].includes(origin));
const out=process.env.LIVE_OUTPUT_DIR||'docs/evidence/pe5684';
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
try{
 const firstPromise=list();await page.goto(origin+'/admin/maintenance');const first=await(await firstPromise).json();
 await expect(page.getByTestId('maintenance-page')).toBeVisible();
 assert(first.total>=120);assert.equal(first.page_size,25);assert.equal(first.venues.length,25);assert(first.venues[0].problem_nights>0);
 const healthy=first.venues.findIndex(v=>!v.problem_nights);if(healthy>=0)assert(first.venues.slice(healthy).every(v=>!v.problem_nights));
 await expect(page.getByTestId('maintenance-pagination-range')).toContainText(String(first.total));
 await expect(page.getByTestId('maintenance-recipients-open')).toContainText('Destinatarios de alertas');
 assert.equal(await page.locator('.maintenance-night-toggle,.maintenance-problem-list').count(),0);
 await page.screenshot({path:out+'/criterion-1-list.png',fullPage:false});
 const nextPromise=list(p=>p.p_page===2);await page.getByTestId('maintenance-pagination-next').click();const second=await(await nextPromise).json();assert.equal(second.page,2);assert(!first.venues.some(v=>second.venues.some(w=>v.venue_id===w.venue_id)));
 const search=page.getByTestId('maintenance-venue-search');
 const searchPromise=list(p=>p.p_query==='QA-120 Sede 117');await search.fill('QA-120 Sede 117');const found=await(await searchPromise).json();assert.equal(found.total,1);assert.equal(found.venues[0].venue_name,'QA-120 Sede 117');
 await expect(page.getByRole('link').filter({hasText:'QA-120 Sede 117'})).toBeVisible();
 await page.screenshot({path:out+'/criterion-1-search.png',fullPage:false});
 report.criteria[1]={total:first.total,page_size:first.page_size,firstProblemNights:first.venues[0].problem_nights,summary:first.summary,page2:second.page,search:'QA-120 Sede 117',found:found.venues[0],screenshot:'criterion-1-list.png'};
 const focus={};
 await search.click();focus.searchPointer=await style(search);noRing(focus.searchPointer);
 await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');focus.searchKeyboard=await style(search);assert(focus.searchKeyboard.focused);assert.equal(focus.searchKeyboard.nav,'keyboard');assert.notEqual(focus.searchKeyboard.element.outlineStyle,'none');
 const button=page.getByTestId('maintenance-recipients-open');await button.click();
 await expect(page.getByRole('dialog')).toBeVisible();const title=page.getByRole('dialog').locator('h2');focus.modalTitle=await style(title);noRing(focus.modalTitle);assert.equal(focus.modalTitle.tabindex,'-1');
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 const refresh=page.getByRole('button',{name:'Actualizar',exact:true});await refresh.click();
 focus.buttonPointer=await style(refresh);noRing(focus.buttonPointer);
 await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');focus.buttonKeyboard=await style(refresh);assert(focus.buttonKeyboard.focused);assert.notEqual(focus.buttonKeyboard.element.outlineStyle,'none');
 const qa45Promise=list(p=>p.p_query==='QA-120 Sede 045');await search.fill('QA-120 Sede 045');const qa45=await(await qa45Promise).json();
 const runPromise=runs();await page.getByRole('link').filter({hasText:'QA-120 Sede 045'}).click();const detail=await(await runPromise).json();
 await expect(page).toHaveURL(new RegExp('/admin/tenants/'+qa45.venues[0].venue_id+'/maintenance'));
 await expect(page.getByTestId('venue-maintenance-tab')).toHaveClass(/active/);
 await expect(page.getByTestId('venue-users-tab')).toBeVisible();await expect(page.getByTestId('venue-print-servers-tab')).toBeVisible();await expect(page.getByTestId('venue-mcp-tab')).toBeVisible();
 assert.equal(detail.page_size,25);assert(detail.nights.length<=25);assert.equal(detail.venue.venue_name,'QA-120 Sede 045');
 const filters=page.locator('.maintenance-run-filters');await expect(filters.locator('input[type=date]').first()).toHaveValue(detail.from);
 const errorPromise=runs(p=>p.p_status==='error');await filters.locator('select').nth(0).selectOption('error');const errors=await(await errorPromise).json();assert.equal(errors.total,2);
 const oldestPromise=runs(p=>p.p_order==='asc');await filters.locator('select').nth(2).selectOption('asc');const oldest=await(await oldestPromise).json();
 assert(oldest.nights[0].local_date<=oldest.nights.at(-1).local_date);await expect(page).toHaveURL(/status=error/);await expect(page).toHaveURL(/order=asc/);
 const night=oldest.nights.find(n=>n.executions.length>1);assert(night,'QA045 archived attempt');
 await page.locator('button[aria-controls="maintenance-night-detail-'+detail.venue.venue_id+'-'+night.local_date+'"]').click();
 await expect(page.locator('.maintenance-execution')).toHaveCount(night.executions.length);assert(await page.locator('.maintenance-task').count()>0);
 await page.screenshot({path:out+'/criterion-2-detail.png',fullPage:false});
 report.criteria[2]={url:page.url(),venue:detail.venue.venue_name,page_size:detail.page_size,total:detail.total,filteredTotal:errors.total,task_keys:detail.task_keys,expandedNight:night.local_date,attempts:night.executions.length,tasks:await page.locator('.maintenance-task').count(),screenshot:'criterion-2-detail.png'};
 // Changing task filters uses the server, and survives a reload.
 assert(detail.task_keys.length);const taskPromise=runs(p=>p.p_task===detail.task_keys[0]);await filters.locator('select').nth(1).selectOption(detail.task_keys[0]);await taskPromise;
 const reloadPromise=runs(p=>p.p_status==='error'&&p.p_order==='asc'&&p.p_task===detail.task_keys[0]);await page.reload();await reloadPromise;
 await page.goto(origin+'/admin/print-servers');const heading=page.locator('#dashboard-list-title');await expect(heading).toBeVisible();await heading.click();focus.inventoryTitle=await style(heading);noRing(focus.inventoryTitle);assert.equal(focus.inventoryTitle.tabindex,null);assert(!focus.inventoryTitle.focused);
 report.criteria[3]=focus;
 assert.deepEqual(report.errors,[]);report.ok=true;
 console.log(JSON.stringify(report,null,2));
} catch(error){report.ok=false;report.failure=String(error.stack||error);await page.screenshot({path:out+'/failure.png',fullPage:true});throw error;}
finally{await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
