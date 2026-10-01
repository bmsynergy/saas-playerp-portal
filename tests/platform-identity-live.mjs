// Opt-in DEV acceptance for /admin/users and the platform role labels, against the
// PUBLISHED portal. Creates only tagged temporary test identities and removes them in
// finally. No session, password, email token or privileged key is written.
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const origin='https://playerp.dev.bmore.app';
const pat=process.env.SUPABASE_ACCESS_TOKEN; assert(pat,'SUPABASE_ACCESS_TOKEN required');
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co', mgmt='https://api.supabase.com/v1/projects/fzwzmwstxlsxdzdmphyq';
const stamp=Date.now(), tag=`piaui-${stamp}`, password=`Pia!${randomBytes(20).toString('hex')}`;
const out=process.env.PIA_OUTPUT??'docs/evidence/platform-identity';await mkdir(out,{recursive:true});
const DYNAMIC='a0000000-0000-0000-0000-000000000001';
const report={origin,project:'fzwzmwstxlsxdzdmphyq',startedAt:new Date().toISOString(),mocks:false,checks:[],screenshots:[],pageErrors:[]};
const ids=[];let browser,anon,service;
async function http(url,body,token,method='POST',key=anon) {
 const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(key?{apikey:key}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}return {status:r.status,data};
}
const admin=(path,body,method='POST')=>http(api+path,body,service,method,service);
async function sql(query){const r=await http(mgmt+'/database/query',{query},pat,'POST',null);if(r.status!==201)throw new Error('DEV query '+r.status+': '+String(r.data?.message??r.data?.error??'failed'));return r.data;}
function ok(name,extra={}){report.checks.push({name,passed:true,...extra});console.log('PASS '+name+(Object.keys(extra).length?'  '+JSON.stringify(extra):''));}
async function make(profile,first,last) {
 const email=`delivered+${tag}-${profile}@resend.dev`;
 const r=await admin('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{first_name:first,last_name:last,full_name:`${first} ${last}`},app_metadata:{pia_ui_test:tag}});
 assert([200,201].includes(r.status),'create temporary user');ids.push(r.data.id);
 return {id:r.data.id,email,password,name:`${first} ${last}`};
}
async function member(c,role){const now=new Date().toISOString();const r=await admin('/rest/v1/platform_staff_members',{user_id:c.id,role,active:true,invited_at:now,accepted_at:now});assert.equal(r.status,201,'create membership');}
async function venueUser(c,role,venue){
 await sql(`insert into public.staff_roles(user_id,role) values ('${c.id}','${role}')`);
 await sql(`insert into public.staff_venue_assignments(user_id,venue_id) values ('${c.id}','${venue}')`);
}
async function loginApi(c){const r=await http(api+'/auth/v1/token?grant_type=password',{email:c.email,password:c.password});assert.equal(r.status,200,'test login');return r.data.access_token;}
async function ctx() {
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-ES'});
 const page=await context.newPage();page.setDefaultTimeout(25_000);
 page.on('pageerror',e=>report.pageErrors.push(String(e).slice(0,200)));
 return {context,page};
}
async function loginUi(page,c){
 await page.goto(origin+'/auth/login?lang=es');
 await page.getByLabel('Correo electrónico',{exact:true}).fill(c.email);await page.getByLabel('Contraseña',{exact:true}).fill(c.password);
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.waitForURL(origin+'/admin');
}
async function snapshot(page,name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});report.screenshots.push(name+'.png');}
const rows=page=>page.locator('[data-testid="identity-row"]');
const count=async page=>(await page.getByTestId('identity-count').textContent()).trim();
async function confirmAndWait(page,notice){
 await page.locator('.staff-confirm').getByRole('button',{name:'Confirmar',exact:true}).click();
 await page.locator('.staff-notice').filter({hasText:notice}).waitFor();
}
try {
 const keys=await http(mgmt+'/api-keys?reveal=true',undefined,pat,'GET',null);assert.equal(keys.status,200);
 anon=keys.data.find(k=>k.name==='anon').api_key;service=keys.data.find(k=>k.name==='service_role').api_key;
 const adminUser=await make('admin','QA','Admin');await member(adminUser,'super_admin');
 const support=await make('soporte','QA','Soporte');await member(support,'support');
 const ops=await make('operaciones','QA','Operaciones');await member(ops,'operations');
 const target=await make('objetivo','QA','Objetivo');await venueUser(target,'front_desk',DYNAMIC);
 const invitedEmail=`delivered+${tag}-invitado@resend.dev`;
 browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{});

 // ---------- Criterio 1: Admin en /admin/users ----------
 const a=await ctx();await loginUi(a.page,adminUser);
 await a.page.getByRole('link',{name:'Usuarios'}).click();await a.page.waitForURL(origin+'/admin/users');
 await rows(a.page).first().waitFor();
 const total=await rows(a.page).count();
 const headers=(await a.page.locator('#identity-list-title').locator('xpath=ancestor::section').locator('thead th').allTextContents()).map(s=>s.trim());
 assert.deepEqual(headers.slice(0,4),['Nombre','Rol de local','Estado','Locales']);
 const table=await rows(a.page).evaluateAll(trs=>trs.map(tr=>{const td=tr.querySelectorAll('td');return {name:td[0].querySelector('strong')?.childNodes[0]?.textContent?.trim()??'',email:td[0].querySelector('small')?.textContent?.trim()??'',role:td[1].querySelector('.staff-role')?.textContent?.trim()??'',status:td[2].textContent.trim(),venues:td[3].textContent.trim()};}));
 const venuesSeen=[...new Set(table.flatMap(r=>r.venues.split(', ')))].filter(v=>!['Sin locales asignados','Todos los locales'].includes(v));
 assert(venuesSeen.length>=2,'users from at least two venues');
 assert(table.every(r=>r.email&&r.role&&r.status&&r.venues),'every row has email, role, status and venues');
 const sample=[table.find(r=>r.email===target.email),table.find(r=>r.venues.includes('Jumping Florida')&&!r.venues.includes('Dynamic Park'))].filter(Boolean);
 assert.equal(sample.length,2);
 ok('listado: usuarios de al menos dos venues con nombre, correo, rol, estado y venues',{count:await count(a.page),venues:venuesSeen,sample});
 await snapshot(a.page,'users-list-1440-es');
 await a.page.getByTestId('identity-search').fill('objetivo');
 await a.page.waitForFunction(n=>document.querySelectorAll('[data-testid="identity-row"]').length<n,total);
 const afterSearch=await rows(a.page).count();assert.equal(afterSearch,1);
 ok('la busqueda reduce la lista',{before:total,after:afterSearch,count:await count(a.page)});
 await a.page.getByTestId('identity-search').fill('');
 await a.page.getByTestId('identity-filter-venue').selectOption({label:'Jumping Florida'});
 const afterFilter=await rows(a.page).count();assert(afterFilter>0&&afterFilter<total);
 ok('el filtro por venue reduce la lista',{before:total,after:afterFilter,count:await count(a.page)});
 await snapshot(a.page,'users-filter-venue-1440-es');
 await a.page.getByTestId('identity-filter-venue').selectOption('');

 // invitar
 const form=a.page.locator('form.staff-invite-form');
 await form.locator('input[type=email]').fill(invitedEmail);
 await form.locator('input[type=text]').nth(0).fill('QA');await form.locator('input[type=text]').nth(1).fill('Invitado');
 await form.getByLabel('Rol de local',{exact:true}).selectOption('front_desk');
 await form.getByLabel('Jumping Florida',{exact:true}).check();
 await form.getByRole('button',{name:'Enviar invitación'}).click();
 await a.page.locator('.staff-notice').filter({hasText:'Invitación enviada.'}).waitFor();
 await rows(a.page).filter({hasText:invitedEmail}).waitFor();
 ok('accion 1/5 invitar: aparece en la lista como Invitado',{row:(await rows(a.page).filter({hasText:invitedEmail}).innerText()).replace(/\s+/g,' ')});

 // detalle
 await rows(a.page).filter({hasText:target.email}).getByRole('link',{name:/Ver detalle/}).click();
 await a.page.waitForURL(origin+'/admin/users/'+target.id);
 await a.page.getByTestId('identity-detail').waitFor();
 await a.page.getByRole('heading',{name:target.name,exact:true}).waitFor();
 ok('se abre el detalle de un usuario',{url:'/admin/users/<id>',heading:target.name});
 await snapshot(a.page,'user-detail-1440-es');
 // cambiar rol
 await a.page.locator('#identity-role').selectOption('manager');
 await a.page.getByRole('button',{name:'Cambiar rol',exact:true}).click();
 await confirmAndWait(a.page,'Acceso a locales actualizado.');
 ok('accion 2/5 cambiar rol (front_desk -> manager)');
 // cambiar asignacion
 await a.page.locator('[aria-labelledby="identity-venues"]').getByLabel('Jumping Florida',{exact:true}).check();
 await a.page.getByRole('button',{name:'Guardar locales',exact:true}).click();
 await confirmAndWait(a.page,'Acceso a locales actualizado.');
 ok('accion 3/5 cambiar asignacion (+ Jumping Florida)');
 // recuperacion
 await a.page.getByRole('button',{name:'Enviar correo de recuperación',exact:true}).click();
 await confirmAndWait(a.page,'Correo de recuperación enviado.');
 ok('accion 4/5 enviar recuperacion (el correo va al buzon del usuario; la pantalla no recibe enlace)');
 // revocar
 await a.page.getByRole('button',{name:'Revocar acceso',exact:true}).click();
 await confirmAndWait(a.page,'Acceso a locales revocado.');
 await a.page.locator('.detail-heading .status-badge').filter({hasText:'Revocado'}).waitFor();
 ok('accion 5/5 revocar: el detalle pasa a Revocado');
 await snapshot(a.page,'user-detail-revoked-1440-es');
 const invitedId=(await sql(`select id::text from auth.users where email='${invitedEmail}'`))[0].id;ids.push(invitedId);
 const audit=await sql(`select l.action, l.actor_scope, au.email as actor, l.target_type, l.metadata->>'user_email' as user_email, to_char(l.created_at at time zone 'utc','YYYY-MM-DD HH24:MI:SS') as created_utc from public.admin_audit_log l left join auth.users au on au.id=l.actor_user_id where l.target_type='venue_user' and l.target_id in ('${target.id}','${invitedId}') and l.action<>'venue_user_recovery_sent' order by l.created_at`);
 assert.deepEqual(audit.map(r=>r.action),['venue_user_invited','venue_user_role_changed','venue_user_assignments_changed','venue_user_recovery_requested','venue_user_access_revoked']);
 assert(audit.every(r=>r.actor===adminUser.email&&r.actor_scope==='platform'));
 ok('admin_audit_log: cinco filas, una por accion, con el Admin de plataforma como actor',{rows:audit});

 // ---------- Criterio 2: etiquetas y Operaciones ----------
 await a.page.getByRole('link',{name:'Staff',exact:true}).click();await a.page.waitForURL(origin+'/admin/staff');
 await a.page.locator('.staff-table tbody tr').first().waitFor();
 const labels={};
 for (const [who,c] of [['admin',adminUser],['soporte',support],['operaciones',ops]]) labels[who]=(await a.page.locator('.staff-table tbody tr').filter({hasText:c.email}).locator('.staff-role').textContent()).trim();
 assert.deepEqual(labels,{admin:'Admin',soporte:'Soporte',operaciones:'Operaciones'});
 const dbRoles=await sql(`select m.role from public.platform_staff_members m where m.user_id in ('${adminUser.id}','${support.id}','${ops.id}') order by m.role`);
 const options=(await a.page.locator('.staff-invite-form select').first().locator('option').allTextContents()).map(s=>s.trim());
 ok('etiquetas del staff de plataforma en el portal publicado',{labels,invite_role_options:options,db_roles:dbRoles.map(r=>r.role)});
 await snapshot(a.page,'staff-labels-1440-es');
 await a.context.close();

 const o=await ctx();await loginUi(o.page,ops);
 await o.page.locator('.stat-card').first().waitFor();
 const nav=(await o.page.locator('.sidebar-nav .nav-link').allTextContents()).map(s=>s.trim());
 assert.deepEqual(nav,['Inicio','Directorio']);
 const totalVenues=(await o.page.locator('.stat-card strong').first().textContent()).trim();
 ok('Operaciones entra a /admin y ve venues; el menu no ofrece Usuarios ni Staff',{nav,total_venues:totalVenues});
 await snapshot(o.page,'operations-home-1440-es');
 await o.page.getByRole('link',{name:'Directorio',exact:true}).click();await o.page.waitForURL(origin+'/admin/tenants');
 await o.page.locator('.directory-row').filter({hasText:'Dynamic Park'}).click();
 await o.page.waitForURL(origin+'/admin/tenants/'+DYNAMIC);
 await o.page.locator('.servers-panel').waitFor();
 const servers=await o.page.locator('.servers-table tbody tr').count();
 ok('Operaciones ve los Print Servers de un venue',{venue:'Dynamic Park',print_servers:servers});
 await snapshot(o.page,'operations-print-servers-1440-es');
 for (const path of ['/admin/users','/admin/staff']) {
  await o.page.goto(origin+path);await o.page.locator('.state-denied').waitFor();
 }
 ok('Operaciones: /admin/users y /admin/staff muestran acceso denegado');
 await o.context.close();
 const opsToken=await loginApi(ops);
 const e1=await http(api+'/functions/v1/platform-identity-admin',{action:'list'},opsToken);
 const e2=await http(api+'/functions/v1/platform-staff-admin',{action:'list'},opsToken);
 assert.deepEqual([e1.status,e1.data?.error,e2.status,e2.data?.error],[403,'forbidden',403,'forbidden']);
 ok('Operaciones recibe 403 de las dos APIs',{'platform-identity-admin':`${e1.status} ${e1.data.error}`,'platform-staff-admin':`${e2.status} ${e2.data.error}`});

 // texto del portal publicado: sin "Facturacion" ni "Billing"
 const html=await (await fetch(origin+'/admin')).text();
 const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m=>m[1]);
 let bytes=html.length,hits=(html.match(/facturaci|billing/gi)??[]).length;
 for (const asset of assets){const text=await (await fetch(origin+asset)).text();bytes+=text.length;hits+=(text.match(/facturaci|billing/gi)??[]).length;}
 assert.equal(hits,0);
 ok('el portal publicado no contiene "Facturación" ni "Billing"',{files:['/admin',...assets],bytes,matches:hits});
 assert.deepEqual(report.pageErrors,[]);
 report.result='passed';
} catch (e) { report.result='failed';report.error=String(e?.message??e).slice(0,600);console.error('FAIL',report.error);process.exitCode=1; }
finally {
 await browser?.close();
 let removed=0;
 for (const id of ids){const r=await admin('/auth/v1/admin/users/'+id,undefined,'DELETE');if(r.status===200)removed++;}
 const left=service?await sql(`select count(*)::int as n from auth.users where email like 'delivered+${tag}-%'`):[{n:null}];
 report.cleanup={test_accounts_removed:removed,left:left[0].n};report.finishedAt=new Date().toISOString();
 console.log('cleanup',JSON.stringify(report.cleanup));
 await writeFile(`${out}/live.json`,JSON.stringify(report,null,1));
}
