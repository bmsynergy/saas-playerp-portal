// Opt-in DEV acceptance for /admin/print-servers against the PUBLISHED portal, driving the real
// screens with a temporary platform Admin and, on the other side, a SIMULATED Print Server that
// talks to the real DEV backend (harness venue A). On Dynamic Park (physical PS) it only reads
// and requests one network scan. Creates only tagged temporary identities and removes them in
// finally. No session, password, enrollment code, credential or privileged key is written.
//   SUPABASE_ACCESS_TOKEN=… PLAYERP_BACKEND_DIR=/path/to/saas-playerp-backend node tests/print-servers-live.mjs
import { chromium } from '@playwright/test';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { randomBytes, createHash, X509Certificate } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_ORIGIN??'https://playerp.dev.bmore.app';
const pat=process.env.SUPABASE_ACCESS_TOKEN; assert(pat,'SUPABASE_ACCESS_TOKEN required');
const backend=process.env.PLAYERP_BACKEND_DIR; assert(backend,'PLAYERP_BACKEND_DIR required (checkout of saas-playerp-backend with _tests/print-server/lib.mjs)');
const { SimulatedPS, admin: psAdmin, sql, q } = await import(pathToFileURL(`${backend}/_tests/print-server/lib.mjs`).href);
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co', mgmt='https://api.supabase.com/v1/projects/fzwzmwstxlsxdzdmphyq';
const stamp=Date.now(), tag=`psfleet-${stamp}`, password=`Psf!${randomBytes(20).toString('hex')}`;
const out=process.env.PSF_OUTPUT??'docs/evidence/print-servers';await mkdir(out,{recursive:true});
const DYNAMIC='a0000000-0000-0000-0000-000000000001', HARNESS='b5a00000-0000-4000-8000-00000000000a';
const MAC='00005E0053E7', LABEL=`Portal SIM ${stamp}`, LABEL2=`Portal SIM ${stamp} caja`;
const CA_PEM=`-----BEGIN CERTIFICATE-----
MIIBqzCCAVGgAwIBAgIUHu6K43z1lHDDCI7qFxPimNBpGPEwCgYIKoZIzj0EAwIw
KzEpMCcGA1UEAwwgUGxheUVSUCBQcmludCBTZXJ2ZXIgU0lNVUxBRE8gQ0EwHhcN
MjYwOTMwMTQwNzAyWhcNMzYwOTI3MTQwNzAyWjArMSkwJwYDVQQDDCBQbGF5RVJQ
IFByaW50IFNlcnZlciBTSU1VTEFETyBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEH
A0IABAAEOunUTs20hXzL08/gWbQ2j6CIOyZ8NIoYutHGCxbIrs1cf1yVURnetkXY
ivz1h5FCc1M2yU9CXlMrZI3H9FWjUzBRMB0GA1UdDgQWBBRbCmHYz0Yr1ucfa+t9
CxXTJ0CHaDAfBgNVHSMEGDAWgBRbCmHYz0Yr1ucfa+t9CxXTJ0CHaDAPBgNVHRMB
Af8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQDy7i9NO2tiO+txBJdZ3tP6cG1b
LC4epx19QLDBld0EeAIgPpeHyZOFRegx9grqfxcV6m2f7I0/CcYm9CteBo7vydg=
-----END CERTIFICATE-----
`;
const report={origin,project:'fzwzmwstxlsxdzdmphyq',startedAt:new Date().toISOString(),mocks:false,simulatedPrintServer:'harness venue A only',physicalPrintServer:'Dynamic Park: read + one scan',checks:[],screenshots:[],pageErrors:[],audit:[]};
const ids=[];let browser,anon,service,ps=null;
async function http(url,body,token,method='POST',key=anon) {
 const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(key?{apikey:key}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}return {status:r.status,data};
}
const adminApi=(path,body,method='POST')=>http(api+path,body,service,method,service);
function ok(name,extra={}){report.checks.push({name,passed:true,...extra});console.log('PASS '+name+(Object.keys(extra).length?'  '+JSON.stringify(extra):''));}
async function resetHarness(){
 for(const s of await sql(`select id from public.print_servers where venue_id=${q(HARNESS)}::uuid and status in ('active','pending')`)) await psAdmin.revoke(s.id,'portal_live_reset');
 await sql(`update public.printer_jobs set status='cancelled', completed_at=now(), last_error='portal live: limpieza' where venue_id=${q(HARNESS)}::uuid and status in ('pending','printing')`);
 await sql(`delete from public.cloud_printers where venue_id=${q(HARNESS)}::uuid and label like 'Portal SIM %'`);
}
const tid=(page,id)=>page.getByTestId(id);
async function confirm(page,{result=true}={}){
 await tid(page,'confirm-dialog').waitFor();
 const text=(await tid(page,'confirm-dialog').innerText()).replace(/\s+/g,' ').trim();
 await tid(page,'confirm-accept').click();
 if(!result) return {confirmation:text};
 await page.locator('[data-testid="action-result"][data-ok]').waitFor();
 const okAttr=await tid(page,'action-result').getAttribute('data-ok');
 const message=(await tid(page,'action-result').innerText()).replace(/\s+/g,' ').trim();
 assert.equal(okAttr,'true','action result: '+message);
 await tid(page,'confirm-dialog').waitFor({state:'detached'});
 return {confirmation:text,result:message};
}
async function snapshot(page,name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});report.screenshots.push(name+'.png');}
const rowCount=page=>page.locator('[data-testid^="fleet-row-"]').count();
try {
 const keys=await http(mgmt+'/api-keys?reveal=true',undefined,pat,'GET',null);assert.equal(keys.status,200);
 anon=keys.data.find(k=>k.name==='anon').api_key;service=keys.data.find(k=>k.name==='service_role').api_key;
 await resetHarness();
 const email=`delivered+${tag}-admin@resend.dev`;
 const made=await adminApi('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{full_name:'QA Flota'},app_metadata:{psfleet_ui_test:tag}});
 assert([200,201].includes(made.status),'create temporary user');ids.push(made.data.id);const actor=made.data.id;
 const now=new Date().toISOString();
 assert.equal((await adminApi('/rest/v1/platform_staff_members',{user_id:actor,role:'super_admin',active:true,invited_at:now,accepted_at:now})).status,201,'create membership');
 browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{});
 const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-ES',acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(30_000);
 page.on('pageerror',e=>report.pageErrors.push(String(e).slice(0,200)));
 await page.goto(origin+'/auth/login?lang=es');
 await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.waitForURL(origin+'/admin');

 // ---------- Flota y filtros ----------
 await page.goto(origin+'/admin/print-servers');
 await tid(page,`fleet-row-${DYNAMIC}`).waitFor();
 const total=await rowCount(page);
 const venues=await page.locator('[data-testid^="fleet-row-"]').evaluateAll(trs=>trs.map(tr=>tr.querySelector('td')?.innerText.replace(/\s+/g,' ').trim()));
 const dpRow=(await tid(page,`fleet-row-${DYNAMIC}`).innerText()).replace(/\s+/g,' ').trim();
 assert(total>=5,'fleet lists the DEV venues');
 ok('flota: una fila por venue de DEV',{count:(await tid(page,'fleet-count').innerText()).trim(),venues});
 ok('flota: el PS fisico de Dynamic Park (0.3.3) aparece en linea',{row:dpRow});
 assert(/0\.3\.3/.test(dpRow)&&/En línea/i.test(dpRow),'physical PS online with 0.3.3');
 await snapshot(page,'fleet-1440-es');
 const reduce=async(name,apply,clear)=>{
  await apply();await page.waitForTimeout(150);const n=await rowCount(page);
  assert(n>0&&n<total,`${name} reduces the list (${n}/${total})`);
  ok(`filtro ${name} reduce la lista`,{before:total,after:n,count:(await tid(page,'fleet-count').innerText()).trim()});
  await clear();await page.waitForTimeout(100);assert.equal(await rowCount(page),total,`${name} cleared`);
 };
 const sel=async(id,value)=>tid(page,id).selectOption(value);
 await reduce('tenant/venue (texto)',()=>tid(page,'fleet-filter-search').fill('dynamic'),()=>tid(page,'fleet-filter-search').fill(''));
 await reduce('tenant/venue (selector)',()=>sel('fleet-filter-venue',DYNAMIC),()=>sel('fleet-filter-venue',''));
 await reduce('version',()=>sel('fleet-filter-version','0.3.3'),()=>sel('fleet-filter-version',''));
 await reduce('ultima señal',()=>sel('fleet-filter-signal','3m'),()=>sel('fleet-filter-signal',''));
 await reduce('estado del PS',()=>sel('fleet-filter-state','online'),()=>sel('fleet-filter-state',''));
 await reduce('impresoras',()=>sel('fleet-filter-printers','with'),()=>sel('fleet-filter-printers',''));

 // ---------- PS fisico (Dynamic Park): solo lectura y un escaneo ----------
 await tid(page,`fleet-open-${DYNAMIC}`).click();
 await page.waitForURL(origin+'/admin/print-servers/'+DYNAMIC);
 await tid(page,'ps-state').waitFor();
 const dp={state:(await tid(page,'ps-state').innerText()).trim(),version:(await tid(page,'ps-version').innerText()).trim(),
  queueDepth:(await tid(page,'ps-queue-depth').innerText()).trim(),pendingJobs:(await tid(page,'ps-pending-jobs').innerText()).trim(),
  certificateAvailable:await tid(page,'ps-cert-download').count()===1};
 assert(/0\.3\.3/.test(dp.version),'physical PS: version shown');
 if(dp.certificateAvailable)assert(/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test((await tid(page,'ps-cert-fingerprint').innerText()).trim()));
 else assert(await tid(page,'ps-cert-pending').isVisible());
 ok('PS fisico: diagnostico, cola y estado real del certificado',dp);
 await tid(page,'ps-scan').click();
 const scanConfirm=await confirm(page);
 const cmdOf=async v=>(await sql(`select id, status, received_at is not null received, completed_at, result->>'count' candidates, error_code from public.print_server_commands where venue_id=${q(v)}::uuid and requested_by=${q(actor)}::uuid order by created_at desc limit 1`))[0];
 for(let i=0;i<100;i++){const c=await cmdOf(DYNAMIC);if(c&&['done','failed','expired'].includes(c.status))break;await page.waitForTimeout(2000);}
 await page.locator('[data-testid="ps-scan-status"][data-status="done"]').waitFor({timeout:30_000});
 const dpCands=await page.locator('[data-testid^="scan-candidate-"]').evaluateAll(els=>els.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
 const dpCmd=await cmdOf(DYNAMIC);
 assert.equal(dpCmd.status,'done','physical PS answered the scan');
 ok('PS fisico: el escaneo pedido desde /admin termina con respuesta del PS',{...scanConfirm,command:dpCmd,candidates:dpCands});
 await snapshot(page,'detail-dynamic-park-1440-es');

 // ---------- Sede de arnes A con PS simulado: ciclo completo ----------
 await page.goto(origin+'/admin/print-servers/'+HARNESS);
 await tid(page,'ps-assign').waitFor();
 await tid(page,'ps-assign').click();
 const c1=await confirm(page,{result:false});
 await tid(page,'enrollment-code').waitFor();
 const code=(await tid(page,'enrollment-code').innerText()).trim();
 assert(/^pse_[0-9a-f]{64}$/.test(code),'enrollment code shown once');
 const stored=await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage),location.href]));
 assert(!stored.includes('pse_'),'enrollment code is not stored in the browser');
 ps=new SimulatedPS('sim-portal');ps.softwareVersion='0.3.3-simulado';ps.caCertPem=CA_PEM;
 const en=await ps.enroll(code,`sim-portal-${stamp}`);assert.equal(en.status,200,'simulated PS enrolls with the code');
 await ps.openChannel();await ps.status({software_version:'0.3.3-simulado'});
 ps.autoScan([{mac_address:MAC,local_address:'192.168.1.61',model:'Star TSP100IV',port:9100}]);
 await tid(page,'enrollment-close').click();
 await tid(page,'enrollment-code').waitFor({state:'detached'});
 await tid(page,'ps-state').filter({hasText:/En línea/i}).waitFor({timeout:40_000});
 ok('1/10 codigo temporal de alta y vinculacion',{...c1,code:'pse_…(68 caracteres, mostrado una vez; no queda en localStorage, sessionStorage ni URL)',printServer:ps.id,state:(await tid(page,'ps-state').innerText()).trim(),version:(await tid(page,'ps-version').innerText()).trim()});

 await tid(page,'ps-scan').click();
 const c2=await confirm(page);
 await tid(page,`scan-candidate-${MAC}`).waitFor({timeout:60_000});
 ok('2/10 escaneo',{...c2,candidate:(await tid(page,`scan-candidate-${MAC}`).innerText()).replace(/\s+/g,' ').trim()});

 await tid(page,`scan-add-${MAC}`).click();
 await tid(page,'printer-form-label').fill(LABEL);
 assert.equal((await tid(page,'printer-form-mac').inputValue()).replace(/[^0-9A-Fa-f]/g,'').toUpperCase(),MAC,'MAC prefilled from the scan');
 await tid(page,'printer-form-submit').click();
 const c3=await confirm(page);
 const row=page.locator('[data-testid^="printer-row-"]').filter({hasText:LABEL});
 await row.waitFor();
 const pid=(await row.getAttribute('data-testid')).replace('printer-row-','');
 ok('3/10 alta de impresora con nombre',{...c3,printer:pid,row:(await row.innerText()).replace(/\s+/g,' ').trim().slice(0,160)});

 await tid(page,`printer-rename-input-${pid}`).fill(LABEL2);
 await tid(page,`printer-rename-${pid}`).click();
 const c4=await confirm(page);
 await tid(page,`printer-row-${pid}`).filter({hasText:LABEL2}).waitFor();
 const ev=await ps.waitEvent(e=>e.event==='printers.changed'&&e.data.reason==='renamed'&&e.data.printer_id===pid,15000);
 const cfg=(await ps.config()).json.printers.find(p=>p.printer_id===pid);
 const db=(await sql(`select label from public.cloud_printers where id=${q(pid)}::uuid`))[0];
 assert(db.label===LABEL2&&cfg?.label===LABEL2&&ev?.data?.label===LABEL2,'same name in PlayERP and in what the PS receives');
 ok('4/10 renombrado: mismo nombre en PlayERP y en lo que recibe el PS',{...c4,playerp:db.label,psEvent:ev.data.label,psConfig:cfg.label});

 await tid(page,`printer-toggle-${pid}`).click();
 const c5=await confirm(page);
 for(let i=0;i<40;i++){if((await sql(`select is_active from public.cloud_printers where id=${q(pid)}::uuid`))[0].is_active===false)break;await page.waitForTimeout(500);}
 assert.equal((await sql(`select is_active from public.cloud_printers where id=${q(pid)}::uuid`))[0].is_active,false);
 ok('5/10 pausa',{...c5,is_active:false});
 await page.waitForTimeout(800);
 await tid(page,`printer-toggle-${pid}`).click();
 const c6=await confirm(page);
 for(let i=0;i<40;i++){if((await sql(`select is_active from public.cloud_printers where id=${q(pid)}::uuid`))[0].is_active===true)break;await page.waitForTimeout(500);}
 assert.equal((await sql(`select is_active from public.cloud_printers where id=${q(pid)}::uuid`))[0].is_active,true);
 ok('6/10 reactivacion',{...c6,is_active:true});
 await page.waitForTimeout(800);

 const t0=new Date().toISOString();
 await tid(page,`printer-test-${pid}`).click();
 const c7=await confirm(page);
 let job=null;for(let i=0;i<40&&!job;i++){job=(await sql(`select id from public.printer_jobs where printer_id=${q(pid)}::uuid and source_type='test' and created_at>=${q(t0)}::timestamptz`))[0]??null;if(!job)await page.waitForTimeout(500);}
 assert(job,'test job created');
 const claim=await ps.claim();const got=claim.json.jobs.find(x=>x.job_id===job.id);assert(got,'the simulated PS receives the test job');
 const pr=ps.persist(got,new Date().toISOString());await ps.ack(got.attempt_id,{received_at:pr.record.received_at,persisted_at:pr.record.persisted_at});
 const sd=ps.simulateSend(got.attempt_id);await ps.result(got.attempt_id,{state:'sent',sent_at:sd.sent_at});
 const jobAfter=(await sql(`select status from public.printer_jobs where id=${q(job.id)}::uuid`))[0];
 ok('7/10 prueba: un trabajo de prueba para esa impresora, recibido por el PS simulado (no imprime)',{...c7,job:job.id,status:jobAfter.status});

 const cert=await tid(page,'ps-cert-fingerprint').innerText();
 const [download]=await Promise.all([page.waitForEvent('download'),tid(page,'ps-cert-download').click()]);
 const file=await readFile(await download.path());
 const sha=createHash('sha256').update(new X509Certificate(file).raw).digest('hex');
 assert(file.toString().includes('BEGIN CERTIFICATE')&&!file.toString().includes('PRIVATE KEY'),'public certificate only');
 assert.equal(cert.replace(/:/g,'').toLowerCase(),sha,'fingerprint shown equals SHA256 of certificate DER');
 ok('8/10 descarga de certificado con huella',{filename:download.suggestedFilename(),bytes:file.length,sha256OfDer:sha,fingerprintShownMatches:true});
 await snapshot(page,'detail-harness-1440-es');

 await tid(page,`printer-remove-${pid}`).click();
 const c9=await confirm(page);
 await tid(page,`printer-row-${pid}`).waitFor({state:'detached'});
 assert.equal((await sql(`select count(*)::int n from public.cloud_printers where id=${q(pid)}::uuid`))[0].n,0);
 ok('9/10 baja de la impresora',c9);

 await tid(page,'ps-revoke').click();
 const c10=await confirm(page);
 await tid(page,'ps-assign').filter({hasText:'Asignar Print Server'}).waitFor({timeout:40_000});
 const after=await ps.config();assert.equal(after.status,401,'revoked PS gets 401');
 ok('10/10 revocacion: el PS recibe 401',{...c10,psConfigHttp:after.status});

 // ---------- Auditoria de la pasada ----------
 const audit=await sql(`select to_char(created_at at time zone 'UTC','HH24:MI:SS') at, actor_scope, action, target_type, left(coalesce(target_id,''),8) target, case when venue_id=${q(DYNAMIC)}::uuid then 'Dynamic Park' when venue_id=${q(HARNESS)}::uuid then 'arnes A' else venue_id::text end venue, metadata->>'ok' ok from public.admin_audit_log where actor_user_id=${q(actor)}::uuid order by created_at`);
 report.audit=audit;
 const actions=audit.map(a=>a.action);
 const expected=['ps_scan_requested','ps_enrollment_created','ps_scan_requested','ps_printer_added','ps_printer_updated','ps_printer_paused','ps_printer_activated','ps_printer_test_requested','ps_printer_removed','ps_revoked'];
 assert.deepEqual(actions,expected,'one audit row per write, in order');
 assert(audit.every(a=>a.actor_scope==='platform'&&a.ok==='true'),'all platform scope');
 assert(!JSON.stringify(await sql(`select metadata from public.admin_audit_log where actor_user_id=${q(actor)}::uuid`)).includes('pse_'),'no enrollment code in audit');
 ok('cada escritura tiene su fila en admin_audit_log con actor_scope=platform',{rows:audit.length});
 console.log('AUDIT select created_at, actor_scope, action, target_type, target_id, venue, metadata->>ok from admin_audit_log where actor_user_id = <admin de la pasada> order by created_at');
 for(const a of audit) console.log('AUDIT '+[a.at,a.actor_scope,a.action.padEnd(26),a.target_type.padEnd(13),a.target.padEnd(8),a.venue.padEnd(12),'ok='+a.ok].join('  '));
 assert.equal(report.pageErrors.length,0,'no page errors');
 report.finishedAt=new Date().toISOString();report.passed=true;
} catch(e) {
 report.passed=false;report.error=String(e?.message??e).slice(0,400);console.error('FAIL '+report.error);process.exitCode=1;
} finally {
 try{ps?.closeChannel();}catch{/* closed */}
 await browser?.close().catch(()=>{});
 await resetHarness().catch(e=>console.error('reset '+e.message));
 for(const id of ids){await sql(`delete from public.platform_staff_members where user_id=${q(id)}::uuid`).catch(()=>{});await adminApi('/auth/v1/admin/users/'+id,undefined,'DELETE');}
 await writeFile(`${out}/live.json`,JSON.stringify(report,null,1));
 console.log(report.passed?`RESULT passed ${report.checks.length} checks`:'RESULT failed');
 process.exit(report.passed?0:1); // the simulated PS keeps timers alive
}
