// DEV-only read-only acceptance for PE-569 portal messages, using real RPC data.
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://playerp.dev.bmore.app';
const out=process.env.LIVE_OUTPUT_DIR||'docs/evidence/pe569-portal';
await mkdir(out,{recursive:true});
const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
const defaults=await readFile(new URL('../build/dev-defaults.ts',import.meta.url),'utf8');
const key=defaults.match(/SUPABASE_PUBLIC_KEY\s*=\s*['"]([^'"]+)/)[1];
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const login=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:accounts.staff_activo.email,password:accounts.staff_activo.password})});
assert.equal(login.status,200);const session=await login.json();
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const report={origin,at:new Date().toISOString(),mocked:false,dataMutations:false,errors:[],criterion1:[],criterion2:[]};
try {
for(const locale of ['es','en']) {
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(({session,locale})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',locale);},{session,locale});
 const page=await context.newPage(); page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 const response=name=>page.waitForResponse(r=>r.url().endsWith('/rpc/'+name)&&r.status()===200);
 const summary=locale==='es'?'Falló 1 de 2 tareas: Cotizaciones sin cobrar caducadas':'1 of 2 tasks failed: Expired unpaid quotes';
 const names=locale==='es'?['Cobros con tarjeta a medias','Cotizaciones sin cobrar caducadas']:['Half-finished card payments','Expired unpaid quotes'];
 const listPromise=response('portal_maintenance_venue_list');await page.goto(origin+'/admin/maintenance?lang='+locale);await listPromise;
 const searchPromise=response('portal_maintenance_venue_list');await page.getByTestId('maintenance-venue-search').fill('QA-120 Sede 120');const list=await(await searchPromise).json();
 const row=page.getByTestId('maintenance-venue-row');await expect(row).toHaveCount(1);await expect(row).toContainText(summary);
 await page.screenshot({path:`${out}/list-${locale}.png`,fullPage:true});
 report.criterion2.push({locale,last_night:list.venues[0].last_night,visibleRow:await row.innerText(),screenshot:`list-${locale}.png`});
 for(const fixture of [
  {id:list.venues[0].venue_id,date:'2026-11-03',kind:'timeout'},
  {id:'d1be4f18-f263-46c0-b4c7-2927500275a7',date:'2026-11-02',kind:'pe5673'}
 ]) {
  const runsPromise=response('portal_maintenance_venue_runs');await page.goto(`${origin}/admin/tenants/${fixture.id}/maintenance?lang=${locale}&from=${fixture.date}&to=${fixture.date}`);const runs=await(await runsPromise).json();
  const night=runs.nights.find(n=>n.local_date===fixture.date);assert(night);
  await page.locator(`button[aria-controls="maintenance-night-detail-${fixture.id}-${fixture.date}"]`).click();
  const body=page.locator(`#maintenance-night-detail-${fixture.id}-${fixture.date}`);await expect(body).toBeVisible();
  const targetSummary=fixture.kind==='timeout'?summary:(locale==='es'?'Falló 1 de 2 tareas: Cobros con tarjeta a medias':'1 of 2 tasks failed: Half-finished card payments');
  await expect(body.locator("..").locator(".maintenance-night-toggle")).toContainText(targetSummary);
  const executions=body.locator('.maintenance-execution');await expect(executions).toHaveCount(night.executions.length);
  for(let i=0;i<night.executions.length;i++) {
   const execution=night.executions[i];const failed=execution.tasks.filter(t=>t.status!=='ok'); const total=execution.tasks.length;
   const taskNames=failed.map(t=>t.key==='pos_card_stale'?names[0]:names[1]).join(', ');
   const phrase=locale==='es'?`Falló 1 de ${total} ${total===1?'tarea':'tareas'}: ${taskNames}`:`1 of ${total} ${total===1?'task':'tasks'} failed: ${taskNames}`;
   await expect(executions.nth(i)).toContainText(phrase);
   if(execution.resolved==null) await expect(executions.nth(i).locator(":scope > .maintenance-facts")).toContainText(locale==='es'?'No aplica':'Not applicable');
  }
  const expectedCause=fixture.kind==='timeout'?(locale==='es'?'Tardó demasiado y se canceló; no cambió nada':'It took too long and was canceled; nothing changed'):(locale==='es'?'Error inesperado':'Unexpected error');
  await expect(body).toContainText(expectedCause);
  const detail=body.locator('details');assert(await detail.count()>0);assert.equal(await body.locator('details[open]').count(),0);
  await expect(detail.first().locator('summary')).toHaveText(locale==='es'?'Ver detalle técnico':'Show technical detail');
  const visible=await body.innerText();assert(!/pe5673_siembra|statement timeout|"seeded"|"failed_tasks"/.test(visible),visible);
  for(const task of await body.locator('.maintenance-task').all()) {
   const label=await task.innerText();assert(names.some(name=>label.includes(name)));assert(/pos_card_stale|pos_quotes_expire/.test(label));
   if(label.includes(expectedCause)) {assert(label.includes(locale==='es'?'No aplica':'Not applicable'));assert(!/Resuelto:.*Unavailable|Resolved:.*Unavailable/.test(label));}
  }
  const options=await page.locator('.maintenance-run-filters select').nth(1).locator('option').allTextContents();for(const name of names)assert(options.includes(name));
  const technical=detail.first();await technical.locator('summary').click();assert(await technical.evaluate(el=>el.open));await technical.locator('summary').click();
  await page.screenshot({path:`${out}/${fixture.kind}-${locale}.png`,fullPage:true});
  report.criterion1.push({locale,fixture:fixture.kind,url:page.url(),night:fixture.date,visibleText:visible,closedTechnicalDetails:await detail.count(),filterOptions:options,screenshot:`${fixture.kind}-${locale}.png`});
 }
 await context.close();
}
assert.deepEqual(report.errors,[]);report.ok=true;
} catch(error){report.ok=false;report.failure=String(error.stack||error);process.exitCode=1;}
finally {await browser.close();await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token}});await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
