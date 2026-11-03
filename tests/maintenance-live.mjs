// DEV-only acceptance: real browser/RPCs, one recipient added then removed.
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = 'https://playerp.dev.bmore.app';
const api = 'https://fzwzmwstxlsxdzdmphyq.supabase.co';
const accounts = JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json', 'utf8'));
const defaults = await readFile(new URL('../build/dev-defaults.ts',import.meta.url),'utf8');
const key = defaults.match(/SUPABASE_PUBLIC_KEY\s*=\s*['"]([^'"]+)/)[1];
const out = process.env.LIVE_OUTPUT_DIR || 'docs/evidence/pe5674';
await mkdir(out,{recursive:true});
const report={origin,startedAt:new Date().toISOString(),mocks:false,pages:[],searches:[],errors:[],criteria:{}};
const browser = await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();page.setDefaultTimeout(30000);
let session,addedId,initialIds;
async function rpc(name,body={}) {
 const response=await fetch(`${api}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal(response.status,200,name);return response.json();
}
const overviewResponse=()=>page.waitForResponse(r=>r.url().endsWith('/rpc/portal_system_maintenance_overview')&&r.status()===200);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('response',async response=>{
 if(response.url().endsWith('/rpc/portal_system_maintenance_overview')&&response.status()===200){
 const data=await response.json(); report.pages.push({request:response.request().postDataJSON(),total:data.total,page:data.page,pages:data.pages,page_size:data.page_size,rows:data.venues.length,summary:data.summary,problems_total:data.problems_total,venues:data.venues.map(v=>({id:v.venue_id,name:v.venue_name,problems:v.problems}))});
 }
 if(response.url().endsWith('/rpc/portal_maintenance_venue_search')&&response.status()===200){const data=await response.json();report.searches.push({request:response.request().postDataJSON(),rows:data.venues.length,names:data.venues.map(v=>v.venue_name)});}
});
try {
 const login=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:accounts.staff_activo.email,password:accounts.staff_activo.password})});
 assert.equal(login.status,200,'DEV fixture login');session=await login.json();
 await context.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},session);
 const firstResponse=overviewResponse();await page.goto(origin+'/admin/maintenance?lang=es');
 const first=await (await firstResponse).json();await page.getByTestId('maintenance-page').waitFor();
 assert(first.total>=120);assert.equal(first.venues.length,25);assert(first.venues[0].problems>0);
 const firstHealthy=first.venues.findIndex(v=>v.problems===0);if(firstHealthy>=0)assert(first.venues.slice(firstHealthy).every(v=>!v.problems));
 await expect(page.locator('.maintenance-venue')).toHaveCount(25);
 await expect(page.getByTestId('maintenance-pagination-range')).toContainText(String(first.total));
 await page.screenshot({path:`${out}/criterion-2-summary.png`,fullPage:false});
 await page.getByTestId('maintenance-pagination').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${out}/criterion-2.png`,fullPage:false});
 const nextResponse=overviewResponse();await page.getByTestId('maintenance-pagination-next').click();const second=await(await nextResponse).json();
 assert.equal(second.page,2);assert.equal(second.venues.length,25);assert(!first.venues.some(v=>second.venues.some(w=>v.venue_id===w.venue_id)));
 report.criteria[2]={total:first.total,rows:first.venues.length,first:first.venues[0].venue_name,firstProblems:first.venues[0].problems,secondPage:second.page,secondRows:second.venues.length,summary:first.summary,screenshot:'criterion-2.png'};
 const venueInput=page.locator('.maintenance-filters [role="combobox"]');
 await venueInput.fill('Sede 117');await page.getByRole('option',{name:'QA-120 Sede 117',exact:true}).waitFor();
 const selectedResponse=overviewResponse();await page.getByRole('option',{name:'QA-120 Sede 117',exact:true}).click();const selected=await(await selectedResponse).json();
 await expect(page.locator('.maintenance-venue')).toHaveCount(1);assert.equal(selected.total,1);assert.equal(selected.venues[0].venue_name,'QA-120 Sede 117');
 await page.screenshot({path:`${out}/criterion-1.png`,fullPage:false});
 report.criteria[1]={searched:'Sede 117',selected:selected.venues[0].venue_name,venueId:selected.venues[0].venue_id,total:selected.total,rows:selected.venues.length,screenshot:'criterion-1.png'};
 // The modal test is completed below using the accessible UI contract.
 const initial=await rpc('portal_maintenance_alert_recipients',{p_query:null,p_limit:20});initialIds=initial.recipients.map(p=>p.user_id).sort();
 const candidate=initial.candidates.find(p=>p.user_id===session.user.id)||initial.candidates[0];assert(candidate,'At least one non-recipient platform fixture required');
 const button=page.getByRole('button',{name:new RegExp(`Destinatarios de alertas \\(${initialIds.length}\\)`)});
 await button.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 await dialog.getByRole('combobox').fill(candidate.email);
 await dialog.getByRole('option').filter({hasText:candidate.email}).click();
 const addResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/portal_maintenance_alert_recipient_set')&&r.request().postDataJSON().p_enabled===true);
 addedId=candidate.user_id;await dialog.getByRole('button',{name:'Agregar',exact:true}).click();assert.equal((await addResponse).status(),200);
 await expect(page.getByTestId('maintenance-recipients-open')).toHaveText(`Destinatarios de alertas (${initialIds.length+1})`);
 await page.screenshot({path:`${out}/criterion-3.png`,fullPage:false});
 const removeResponse=page.waitForResponse(r=>r.url().endsWith('/rpc/portal_maintenance_alert_recipient_set')&&r.request().postDataJSON().p_enabled===false);
 await dialog.getByRole('button',{name:`Quitar ${candidate.email}`,exact:true}).click();assert.equal((await removeResponse).status(),200);
 await expect(page.getByTestId('maintenance-recipients-open')).toHaveText(`Destinatarios de alertas (${initialIds.length})`);
 const restored=await rpc('portal_maintenance_alert_recipients');assert.deepEqual(restored.recipients.map(p=>p.user_id).sort(),initialIds);addedId=null;
 report.criteria[3]={before:initialIds.length,afterAdd:initialIds.length+1,afterRemove:restored.recipients.length,restored:true,serverSearch:true,screenshot:'criterion-3.png'};
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
 // 'View night' must request its venue, including from another history page.
 await venueInput.click();const clearResponse=overviewResponse();await page.getByRole('option',{name:'Todas las sedes',exact:true}).click();await clearResponse;
 const viewResponse=overviewResponse();await page.locator('.maintenance-problem').first().getByRole('button',{name:'Ver noche',exact:true}).click();const nightPage=await(await viewResponse).json();
 assert.equal(nightPage.total,1);await expect(page.locator('.maintenance-venue')).toHaveCount(1);await expect(page.locator('.maintenance-night-toggle[aria-expanded="true"]')).toHaveCount(1);
 report.viewNight={filtered:true,total:nightPage.total,expanded:true};
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');
 await page.getByTestId('maintenance-recipients-open').click();await page.getByRole('dialog').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/mobile.png`});await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 assert.equal(report.errors.length,0);assert(report.pages.every(p=>p.rows<=25&&p.request.p_page_size===25));report.passed=true;
} catch(error) {report.passed=false;report.failure=error.message;process.exitCode=1;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally {
 if(addedId){await rpc('portal_maintenance_alert_recipient_set',{p_user_id:addedId,p_enabled:false});const restored=await rpc('portal_maintenance_alert_recipients');assert.deepEqual(restored.recipients.map(p=>p.user_id).sort(),initialIds);report.cleanupRestored=true;}
 if(session)await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`}});
 report.finishedAt=new Date().toISOString();await writeFile(`${out}/acceptance.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed,criteria:report.criteria,failure:report.failure}));
}
