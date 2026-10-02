// Opt-in DEV acceptance for the per-printer print queue of /admin/print-servers/<venue>, against
// the PUBLISHED portal with a temporary platform Admin and the real DEV backend. It writes only
// on harness venue A (one «Impresión de prueba», cancelled in finally); on Dynamic Park (physical
// PS) it only reads. Creates one tagged temporary identity and removes it in finally. No session,
// password, credential or privileged key is written.
//   SUPABASE_ACCESS_TOKEN=… PLAYERP_BACKEND_DIR=/path/to/saas-playerp-backend node tests/print-queue-live.mjs
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_ORIGIN??'https://playerp.dev.bmore.app';
const pat=process.env.SUPABASE_ACCESS_TOKEN; assert(pat,'SUPABASE_ACCESS_TOKEN required');
const backend=process.env.PLAYERP_BACKEND_DIR; assert(backend,'PLAYERP_BACKEND_DIR required (checkout of saas-playerp-backend with _tests/print-server/lib.mjs)');
const { sql, q } = await import(pathToFileURL(`${backend}/_tests/print-server/lib.mjs`).href);
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co', mgmt='https://api.supabase.com/v1/projects/fzwzmwstxlsxdzdmphyq';
const stamp=Date.now(), tag=`psqueue-${stamp}`, password=`Psq!${randomBytes(20).toString('hex')}`;
const out=process.env.PSQ_OUTPUT??'docs/evidence/print-queue';await mkdir(out,{recursive:true});
const DYNAMIC='a0000000-0000-0000-0000-000000000001', HARNESS='b5a00000-0000-4000-8000-00000000000a';
const A1='b5a00000-0000-4000-8000-0000000000a1', A2='b5a00000-0000-4000-8000-0000000000a2', PAGE=10;
const report={origin,project:'fzwzmwstxlsxdzdmphyq',startedAt:new Date().toISOString(),mocks:false,writes:'harness venue A only: one test print, cancelled at the end',physicalPrintServer:'Dynamic Park: read only',checks:[],screenshots:[],pageErrors:[]};
const ids=[],created=[];let browser,anon,service;
async function http(url,body,token,method='POST',key=anon) {
 const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(key?{apikey:key}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}return {status:r.status,data};
}
const adminApi=(path,body,method='POST')=>http(api+path,body,service,method,service);
function ok(name,extra={}){report.checks.push({name,passed:true,...extra});console.log('PASS '+name+(Object.keys(extra).length?'  '+JSON.stringify(extra):''));}
const tid=(page,id)=>page.getByTestId(id);
const flat=s=>s.replace(/\s+/g,' ').trim();
async function snapshot(page,name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});report.screenshots.push(name+'.png');}
const truth=async(venue,printer)=>(await sql(`select id from public.printer_jobs where venue_id=${q(venue)}::uuid and printer_id=${q(printer)}::uuid order by created_at desc, id desc`)).map(r=>r.id);
const settled=(page,printer)=>page.locator(`[data-testid="queue-${printer}"][data-loading="false"]`).waitFor();
const rowIds=(page,printer)=>tid(page,`queue-${printer}`).locator('[data-testid^="job-row-"]').evaluateAll(trs=>trs.map(tr=>tr.getAttribute('data-testid').slice('job-row-'.length)));
// One row as the five cells the screen shows.
const rowCells=(page,job)=>tid(page,`job-row-${job}`).locator('td').evaluateAll(tds=>Object.fromEntries(tds.map(td=>[td.getAttribute('data-label'),td.innerText.replace(/\s+/g,' ').trim()])));
try {
 const keys=await http(mgmt+'/api-keys?reveal=true',undefined,pat,'GET',null);assert.equal(keys.status,200);
 anon=keys.data.find(k=>k.name==='anon').api_key;service=keys.data.find(k=>k.name==='service_role').api_key;
 const email=`delivered+${tag}-admin@resend.dev`;
 const made=await adminApi('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{full_name:'QA Cola'},app_metadata:{psqueue_ui_test:tag}});
 assert([200,201].includes(made.status),'create temporary user');ids.push(made.data.id);const actor=made.data.id;
 const now=new Date().toISOString();
 assert.equal((await adminApi('/rest/v1/platform_staff_members',{user_id:actor,role:'super_admin',active:true,invited_at:now,accepted_at:now})).status,201,'create membership');
 const dpBefore=await sql(`select count(*)::int n, coalesce(max(created_at)::text,'') last from public.printer_jobs where venue_id=${q(DYNAMIC)}::uuid`);
 const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??process.env.PLAYWRIGHT_CHROMIUM;
 browser=await chromium.launch(executablePath?{executablePath,args:['--no-sandbox']}:{});
 const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-ES'});
 const page=await context.newPage();page.setDefaultTimeout(30_000);
 page.on('pageerror',e=>report.pageErrors.push(String(e).slice(0,200)));
 // Every queue request the published portal makes, with its answer.
 const calls=[];
 page.on('response',async res=>{
  if(!res.url().endsWith('/rest/v1/rpc/ps_panel_printer_jobs')) return;
  const args=res.request().postDataJSON();const body=await res.text().catch(()=>'');
  calls.push({venue:args.p_venue_id,printer:args.p_printer_id,limit:args.p_limit,offset:args.p_offset,status:res.status(),body});
 });
 await page.goto(origin+'/auth/login?lang=es');
 await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.waitForURL(origin+'/admin');

 // ---------- Sede de arnés A: cola de cada impresora ----------
 await page.goto(origin+'/admin/print-servers/'+HARNESS);
 await tid(page,'ps-state').waitFor();await settled(page,A1);await settled(page,A2);
 const headers=await tid(page,`queue-${A1}`).locator('thead th').evaluateAll(ths=>ths.map(th=>th.textContent.trim()));
 assert.deepEqual(headers,['Estado','Fecha','Origen','Intentos','Error']);
 const printers=await page.locator('[data-testid^="printer-row-"]').count(), queues=await page.locator('[data-testid^="queue-b5a"]').count();
 assert.equal(queues,printers,'one queue per printer of the venue');
 let tA1=await truth(HARNESS,A1); const tA2=await truth(HARNESS,A2);
 assert.deepEqual(await rowIds(page,A1),tA1.slice(0,PAGE),'A-P1 page 1 is the newest of printer_jobs for that venue and printer');
 assert.deepEqual(await rowIds(page,A2),tA2.slice(0,PAGE),'A-P2 page 1 likewise');
 ok('cada impresora del venue tiene su cola con las columnas estado, fecha, origen, intentos y error',{headers,printers,queues,
  'A-P1':flat(await tid(page,`queue-total-${A1}`).innerText()),'A-P2':flat(await tid(page,`queue-total-${A2}`).innerText())});

 // Un trabajo real de «Impresión de prueba», pedido desde la propia pantalla.
 await tid(page,`printer-test-${A1}`).click();
 await tid(page,'confirm-dialog').waitFor();await tid(page,'confirm-accept').click();
 await page.locator('[data-testid="action-result"][data-ok="true"]').waitFor();
 const fresh=(await sql(`select id from public.printer_jobs where printer_id=${q(A1)}::uuid and source_type='test' and created_at > ${q(report.startedAt)}::timestamptz order by created_at desc limit 1`))[0]?.id;
 assert(fresh,'the test print created a job');created.push(fresh);
 await tid(page,`job-row-${fresh}`).waitFor();
 const cells=await rowCells(page,fresh);
 assert.equal(cells.Estado,'En cola');assert.equal(cells.Origen,'Impresión de prueba');assert.equal(cells.Intentos,'0');assert.equal(cells.Error,'Sin error');assert(/2026/.test(cells.Fecha),'date shown');
 ok('un trabajo real de «Impresión de prueba» sale en la cola de su impresora con los cinco datos',{job:fresh.slice(0,8),...cells});
 const errored=tid(page,`queue-${A1}`).locator('tr:has(.ps-error-text)').first();
 if(await errored.count()){
  const id=(await errored.getAttribute('data-testid')).slice('job-row-'.length);
  ok('un trabajo con error muestra un mensaje útil (texto del portal a partir del código)',{job:id.slice(0,8),...await rowCells(page,id)});
 }
 assert(!(await rowIds(page,A2)).includes(fresh),'the new A-P1 job is not in the A-P2 queue');
 await snapshot(page,'queue-harness-1440-es');

 // ---------- Paginación ----------
 tA1=await truth(HARNESS,A1);const pages=Math.ceil(tA1.length/PAGE);
 assert(pages>=2,'A-P1 has more than one page');
 assert.equal(flat(await tid(page,`queue-page-${A1}`).innerText()),`Página 1 de ${pages}`);assert(await tid(page,`queue-prev-${A1}`).isDisabled());
 await tid(page,`queue-next-${A1}`).click();await tid(page,`queue-page-${A1}`).getByText(`Página 2 de ${pages}`,{exact:true}).waitFor();await settled(page,A1);
 const second=await rowIds(page,A1);assert.deepEqual(second,tA1.slice(PAGE,2*PAGE),'page 2 is rows 11-20');
 await tid(page,`queue-prev-${A1}`).click();await tid(page,`queue-page-${A1}`).getByText(`Página 1 de ${pages}`,{exact:true}).waitFor();await settled(page,A1);
 assert.deepEqual(await rowIds(page,A1),tA1.slice(0,PAGE),'back on page 1');
 ok('paginación: siguiente y anterior cambian de página sin solape',{total:tA1.length,pages,page2First:second[0].slice(0,8),page1First:tA1[0].slice(0,8)});

 // ---------- Refrescar ----------
 const before=calls.filter(c=>c.printer===A1).length;
 await tid(page,`queue-refresh-${A1}`).click();
 for(let i=0;i<50&&calls.filter(c=>c.printer===A1).length===before;i++) await page.waitForTimeout(200);
 await settled(page,A1);await page.waitForTimeout(500);
 const after=calls.filter(c=>c.printer===A1);
 assert.equal(after.length,before+1,'refresh made exactly one new request');assert.equal(after.at(-1).status,200);assert.equal(after.at(-1).offset,0);
 ok('refrescar vuelve a pedir los datos',{requestsBefore:before,requestsAfter:after.length,lastRequest:{venue:after.at(-1).venue.slice(0,13),printer:after.at(-1).printer.slice(-2),limit:after.at(-1).limit,offset:after.at(-1).offset,status:after.at(-1).status}});

 // ---------- Dynamic Park (PS físico): solo lectura; trabajos reales y cola vacía ----------
 const dpPrinters=await sql(`select p.id, p.label, (select count(*)::int from public.printer_jobs j where j.printer_id=p.id and j.venue_id=p.venue_id) n from public.cloud_printers p where p.venue_id=${q(DYNAMIC)}::uuid and p.print_route='ps' order by n desc`);
 const busy=dpPrinters.find(p=>p.n>0), empty=dpPrinters.find(p=>p.n===0);
 await page.goto(origin+'/admin/print-servers/'+DYNAMIC);
 await tid(page,'ps-state').waitFor();for(const p of dpPrinters) await settled(page,p.id);
 if(busy){
  const tB=await truth(DYNAMIC,busy.id);assert.deepEqual(await rowIds(page,busy.id),tB.slice(0,PAGE));
  ok('Dynamic Park: la cola de una impresora del PS físico muestra sus trabajos reales',{printer:busy.label,total:flat(await tid(page,`queue-total-${busy.id}`).innerText()),first:await rowCells(page,tB[0])});
 }
 assert(empty,'Dynamic Park has a ps printer without jobs');
 const emptyText=flat(await tid(page,`queue-empty-${empty.id}`).innerText());
 assert(emptyText.startsWith('Cola vacía'));assert.equal(await tid(page,`queue-${empty.id}`).locator('[data-testid^="job-row-"]').count(),0);
 ok('una impresora sin trabajos muestra el mensaje de cola vacía',{printer:empty.label,message:emptyText});
 await snapshot(page,'queue-dynamic-park-1440-es');

 // ---------- Lo que viajó por la red ----------
 assert(calls.length>0&&calls.every(c=>c.status===200&&c.limit===PAGE));
 const wrong=calls.filter(c=>{const jobs=JSON.parse(c.body).jobs??[];return !(c.venue===HARNESS&&[A1,A2].includes(c.printer)||c.venue===DYNAMIC&&dpPrinters.some(p=>p.id===c.printer))||(c.printer===A2&&jobs.some(j=>!tA2.includes(j.id)))||(c.printer===A1&&jobs.some(j=>tA2.includes(j.id)));});
 assert.equal(wrong.length,0,'every request carried its own venue and printer, and no answer mixed printers');
 const bodies=calls.map(c=>c.body).join('\n');
 assert(!/payload_text|job_token|confirm_code|source_id|last_error|PRUEBA PRINT SERVER/.test(bodies),'no payload or token in any answer');
 ok('las respuestas que recibió el navegador no traen payload_text ni job_token, y cada petición llevó su venue y su impresora',{requests:calls.length,bytes:bodies.length});
 const dpAfter=await sql(`select count(*)::int n, coalesce(max(created_at)::text,'') last from public.printer_jobs where venue_id=${q(DYNAMIC)}::uuid`);
 const audit=await sql(`select action, venue_id from public.admin_audit_log where actor_user_id=${q(actor)}::uuid order by created_at`);
 assert.deepEqual(audit.map(a=>[a.action,a.venue_id]),[['ps_printer_test_requested',HARNESS]],'the only write of this run is the test print on the harness venue');
 ok('Dynamic Park no recibió ninguna escritura de esta pasada',{printerJobsBefore:dpBefore[0],printerJobsAfter:dpAfter[0],auditRowsOfThisRun:audit.map(a=>a.action+' @ sede de arnés A')});
 assert.equal(report.pageErrors.length,0,'no page errors');
 report.finishedAt=new Date().toISOString();report.passed=true;
} catch(e) {
 report.passed=false;report.error=String(e?.message??e).slice(0,400);console.error('FAIL '+report.error);process.exitCode=1;
} finally {
 await browser?.close().catch(()=>{});
 if(created.length) await sql(`with f as (select set_config('playerp.print_actor','ps',true) v) update public.printer_jobs set status='cancelled', completed_at=now(), last_error='Cancelled: portal live queue: limpieza' from f where id in (${created.map(id=>`${q(id)}::uuid`).join(',')}) and status in ('pending','printing')`).catch(e=>console.error('cleanup '+e.message));
 for(const id of ids){await sql(`delete from public.platform_staff_members where user_id=${q(id)}::uuid`).catch(()=>{});await adminApi('/auth/v1/admin/users/'+id,undefined,'DELETE');}
 await writeFile(`${out}/live.json`,JSON.stringify(report,null,1));
 console.log(report.passed?`RESULT passed ${report.checks.length} checks`:'RESULT failed');
 process.exit(report.passed?0:1);
}
