// Real DEV sessions and backend; only the browser origin can be local before publication.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN||'http://127.0.0.1:18791';
const out=process.env.SUPPORT_EVIDENCE_DIR||'test-results/support-live';await mkdir(out,{recursive:true});
const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
const key=(await readFile('build/dev-defaults.ts','utf8')).match(/SUPABASE_PUBLIC_KEY\s*=\s*['"]([^'"]+)/)[1];
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const report={origin,mocks:false,criteria:{},errors:[]};const sessions=[];const contexts=[];
async function login(name){const a=accounts[name];const r=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})});assert.equal(r.status,200);const s=await r.json();sessions.push(s);return s;}
async function rpc(session,name,body={}){const r=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function pageFor(session){const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);await context.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},session);const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().includes('/functions/v1/')&&r.status()>=400)report.errors.push(r.url().split('/').pop()+': '+r.status());});return page;}
const response=(page,name)=>{const p=page.waitForResponse(r=>r.url().endsWith('/'+name)&&r.status()===200);p.catch(()=>{});return p;};
let page;
try{
 const admin=await login('staff_activo'),owner=await login('owner_varios');
 const ownerTickets=(await rpc(owner,'support_ticket_list',{p_scope:'venue'})).data;
 const target=ownerTickets.items.find(t=>t.subject.startsWith('[PE-571 prueba]'));assert(target);assert.notEqual(target.created_by,owner.user.id,'ticket opened by another employee');
 page=await pageFor(owner);await page.goto(origin+'/?section=support');await expect(page.getByTestId('support-page')).toBeVisible();await expect(page.getByTestId('support-ticket-'+target.id)).toBeVisible();
 await page.screenshot({path:out+'/owner-overview.png',fullPage:true});
 await page.goto(origin+'/?venue='+target.venue_id+'&section=support');await page.getByTestId('support-ticket-'+target.id).click();await expect(page.getByTestId('support-thread')).toBeVisible();
 const ownerReply='[PE-571.2 UI DEV] Respuesta de comprobación '+new Date().toISOString();
 await page.getByTestId('support-reply-body').fill(ownerReply);const reply=response(page,'reply-support-ticket');await page.getByTestId('support-send').click();await reply;await expect(page.getByTestId('support-thread')).toContainText(ownerReply);
 await page.screenshot({path:out+'/owner-thread.png',fullPage:true});
 report.criteria[1]={venue:target.venue_id,ticket:target.id,creatorIsAnotherEmployee:true,ownerOverviewTotal:ownerTickets.total,replyPersisted:true};
 const adminPage=await pageFor(admin);page=adminPage;const first=response(page,'support_ticket_list');await page.goto(origin+'/admin/support');const firstData=await(await first).json();await expect(page.getByTestId('support-page')).toBeVisible();assert(firstData.total>100);assert.equal(firstData.items.length,25);
 const next=response(page,'support_ticket_list');await page.getByTestId('support-pagination-next').click();const secondData=await(await next).json();assert.equal(secondData.page,2);assert(!firstData.items.some(t=>secondData.items.some(v=>v.id===t.id)));
 await page.getByRole('searchbox').fill(target.subject);await expect(page.getByTestId('support-ticket-'+target.id)).toBeVisible();
 await page.getByTestId('support-ticket-'+target.id).click();await expect(page.getByTestId('support-thread')).toContainText(ownerReply);
 const thread=page.getByTestId('support-thread');
 const before=(await rpc(admin,'support_ticket_detail',{p_scope:'platform',p_ticket_id:target.id})).data.ticket;
 const note='[PE-571.2 UI DEV] Nota privada '+new Date().toISOString();
 await thread.getByRole('button',{name:'Nota interna',exact:true}).click();await page.getByTestId('support-reply-body').fill(note);
 const noted=response(page,'support_ticket_add_internal_note');await page.getByTestId('support-send').click();await noted;await expect(thread.locator('.support-message.is-internal').filter({hasText:note})).toHaveCount(1);
 await expect(page.getByTestId('support-send')).toBeDisabled();
 const candidates=(await rpc(admin,'support_assignable_staff')).data;const assignee=candidates.find(s=>s.user_id!==before.assigned_to)?.user_id;assert(assignee,'Another assignable test staff member');
 const assigned=response(page,'support-ticket-assign');await thread.getByLabel('Asignar a',{exact:true}).selectOption(assignee);await assigned;await expect(thread.getByLabel('Asignar a',{exact:true})).toBeEnabled();
 const priority=before.priority==='urgent'?'high':'urgent';const prioritized=response(page,'support_ticket_set_priority');await thread.getByLabel('Cambiar prioridad',{exact:true}).selectOption(priority);await prioritized;await expect(thread.getByLabel('Cambiar prioridad',{exact:true})).toBeEnabled();
 const status=before.status==='waiting_tenant'?'in_progress':'waiting_tenant';const changed=response(page,'update-support-ticket-status');await thread.getByLabel('Cambiar estado',{exact:true}).selectOption(status);await changed;await expect(thread.getByLabel('Cambiar estado',{exact:true})).toBeEnabled();
 await thread.getByRole('button',{name:'Responder',exact:true}).click();const publicReply='[PE-571.2 UI DEV] Respuesta pública '+new Date().toISOString();await page.getByTestId('support-reply-body').fill(publicReply);const replied=response(page,'reply-support-ticket');await page.getByTestId('support-send').click();await replied;await expect(thread).toContainText(publicReply);
 const after=(await rpc(admin,'support_ticket_detail',{p_scope:'platform',p_ticket_id:target.id})).data.ticket;assert.equal(after.assigned_to,assignee||null);assert.equal(after.priority,priority);assert.equal(after.status,status);
 const unreadBefore=(await rpc(owner,'support_ticket_list',{p_scope:'venue'})).data.items.find(t=>t.id===target.id);assert.equal(unreadBefore.unread,true);assert.equal(unreadBefore.pending,true);
 const ownerPage=await pageFor(owner);await ownerPage.goto(origin+'/?venue='+target.venue_id+'&section=support');await ownerPage.getByTestId('support-ticket-'+target.id).click();await expect(ownerPage.getByTestId('support-thread')).toContainText(publicReply);await expect(ownerPage.getByTestId('support-thread')).not.toContainText(note);await expect(ownerPage.getByRole('button',{name:'Nota interna',exact:true})).toHaveCount(0);
 const unreadAfter=(await rpc(owner,'support_ticket_list',{p_scope:'venue'})).data.items.find(t=>t.id===target.id);assert.equal(unreadAfter.unread,false);
 report.adminMutations={assigned:true,priority:true,status:true,publicReply:true,internalNote:true};report.unread={before:unreadBefore.unread,after:unreadAfter.unread,pending:true,privateNoteHidden:true};
 // Restore fixture metadata; the clearly labelled test conversation remains as evidence.
 await rpc(admin,'support_ticket_assign',{p_ticket_id:target.id,p_assignee:before.assigned_to??null});await rpc(admin,'support_ticket_set_priority',{p_ticket_id:target.id,p_priority:before.priority});await rpc(admin,'update_support_ticket_status',{p_ticket_id:target.id,p_new_status:before.status});

 await page.screenshot({path:out+'/admin-thread.png',fullPage:true});
 report.criteria[2]={total:firstData.total,pageSize:firstData.items.length,page2:secondData.page,...report.adminMutations};
 const foreign=firstData.items.find(t=>!ownerTickets.items.some(o=>o.venue_id===t.venue_id));assert(foreign);
 const denied=await rpc(owner,'support_ticket_detail',{p_scope:'venue',p_ticket_id:foreign.id});assert.equal(denied.status,403);
 const foreignList=await rpc(owner,'support_ticket_list',{p_scope:'venue',p_venue_ids:[foreign.venue_id]});assert.equal(foreignList.data.total,0);
 report.criteria[3]={foreignDetailStatus:denied.status,foreignListTotal:foreignList.data.total,...report.unread};
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/mobile.png',fullPage:true});report.criteria[4]={mobileWidth:390,noHorizontalOverflow:true};
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.failure=e.message;process.exitCode=1;if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}
finally{for(const context of contexts)await context.close();for(const s of sessions)await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+s.access_token}});await browser.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
