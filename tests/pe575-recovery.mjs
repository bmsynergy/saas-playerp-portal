// Focused synthetic regression: lost response/reload, same-key retry, lifecycle rendering.
// No backend writes. This is deliberately separate from pe575-live.mjs.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PORTAL_TEST_ORIGIN || 'http://127.0.0.1:18793';
assert.equal(origin, 'http://127.0.0.1:18793');
const out = 'test-results/pe575-recovery'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const uid = '11111111-1111-4111-8111-111111111111', vid = '22222222-2222-4222-8222-222222222222';
const requestKey = '33333333-3333-4333-8333-333333333333';
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url'), exp = Math.floor(Date.now()/1000)+3600;
const user = { id: uid, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-04T00:00:00Z' };
const session = { user, access_token: `${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic`, refresh_token: 'synthetic', expires_at: exp, expires_in: 3600, token_type: 'bearer' };
const form = { name: 'Recovery venue', slug: 'recovery-venue', timezone: 'America/Puerto_Rico', email: '', phone: '', address: '', city: '', state: '', owner_email: 'owner@example.invalid', owner_first_name: 'Test', owner_last_name: 'Owner', locale: 'en' };
const report = { mocks: true, checks: [], errors: [] };
try {
 const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
 await ctx.addInitScript(({session,form,uid,requestKey}) => {
   localStorage.setItem('playerp.portal.dev.auth', JSON.stringify(session));
   if (!sessionStorage.getItem('fixture.init')) {
     localStorage.setItem('playerp.locale', 'en');
     sessionStorage.setItem(`playerp.portal.newTenant.${uid}`, JSON.stringify({ request_key: requestKey, form, submitted: false }));
     sessionStorage.setItem('fixture.init', '1');
   }
 }, { session, form, uid, requestKey });
 let rejected = false;
 let creates = [], statuses = [], lifecycle = 'setup_incomplete';
 await ctx.route(url => !url.href.startsWith(origin), async route => {
   const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').pop();
   if (url.hostname !== 'fzwzmwstxlsxdzdmphyq.supabase.co') return route.abort();
   const send = (data,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if (url.pathname.startsWith('/auth/v1/')) return send(name==='user'?user:session);
   if (name==='staff_profiles') return send(null);
   if (name==='is_platform_staff') return send(true);
   if (name==='portal_access') return send({is_platform_staff:true,platform_role:'super_admin',owner_venues:[]});
   const body = req.postDataJSON() ?? {};
   if (name==='platform-tenant-onboard') {
     const response = {request_key:body.request_key,status:'completed',venue_id:vid,venue_name:form.name,venue_slug:form.slug,owner_email:form.owner_email};
     if (body.action==='status') { if(rejected)return send({error:'request_not_found'},404); statuses.push(body); return send({...response,status:'owner_ready',venue_id:null}); }
     if (body.action==='create') { if(rejected)return send({error:'duplicate_slug'},409); creates.push(body); if (creates.length===1) return route.abort('failed'); return send(response); }
   }
   if (name==='portal_tenant_detail') return send({venue:{id:vid,name:form.name,slug:form.slug,is_active:false},print_servers:[]});
   if (name==='portal_tenant_readiness') return send({venue_id:vid,lifecycle,is_active:lifecycle==='active',billing:{status:'trial',plan_name:'test'},items:[
     {key:'basic_info',state:'incomplete',required_for_ready:true,managed_in:'portal',missing:['city']},
     {key:'owner_access',state:'accepted',required_for_ready:true,managed_in:'portal',owners_total:1,owners_accepted:1},
     {key:'stripe_connect',state:'not_started',required_for_ready:true,managed_in:'admin_legacy'},
     {key:'domain',state:'not_configured',required_for_ready:false,managed_in:'admin_legacy'},
     {key:'operations',state:'not_started',required_for_ready:false,managed_in:'pos',terminal_readers:'not_tracked_here',workstations_active:0,print_servers_active:0,operating_hours_set:false,tax_settings_set:false}
   ]});
   report.errors.push('Unexpected API '+name); return send({},500);
 });
 const page = await ctx.newPage(); page.setDefaultTimeout(15000);
 page.on('pageerror', e => report.errors.push(e.message));
 await page.goto(origin+'/admin/tenants/new');
 // Seed only form values, then use the real wizard's review and send controls.
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Create tenant',exact:true}).click();
 await expect.poll(()=>creates.length).toBe(1);
 const draft = await page.evaluate(uid => JSON.parse(sessionStorage.getItem(`playerp.portal.newTenant.${uid}`)), uid);
 assert.equal(draft.submitted,true); assert.equal(draft.request_key,requestKey);
 await page.reload();
 await expect.poll(()=>statuses.length).toBe(1);
 assert.equal(statuses[0].request_key,requestKey);
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await expect.poll(()=>creates.length).toBe(2);
 assert.deepEqual(creates[0],creates[1]);
 await expect(page.getByText('Tenant created',{exact:true})).toBeVisible();
 report.checks.push('Lost create response: submitted persisted before response, reload queries original key, retry sends identical body and key; one simulated venue.');
 rejected=true;
 const rejectedKey='44444444-4444-4444-8444-444444444444';
 await page.evaluate(({uid,form,requestKey})=>sessionStorage.setItem(`playerp.portal.newTenant.${uid}`,JSON.stringify({request_key:requestKey,form,submitted:false})),{uid,form,requestKey:rejectedKey});
 await page.reload();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Create tenant',exact:true}).click();
 await expect(page.getByRole('button',{name:'Back',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.getByLabel('Short name (slug) *')).toBeEditable();
 assert.equal(await page.evaluate(uid=>JSON.parse(sessionStorage.getItem(`playerp.portal.newTenant.${uid}`)).request_key,uid),rejectedKey);
 report.checks.push('Duplicate slug rejection: automatic status confirms request absent, review can return to editable fields; key not discarded on error.');
 for (const locale of ['en','es']) {
   for (const state of ['setup_incomplete','ready','active','suspended']) {
     lifecycle=state;
     await page.goto(origin+`/admin/tenants/${vid}?lang=${locale}`);
     await expect(page.locator(`.readiness-panel .readiness-${state}`)).toBeVisible();
     assert.equal(await page.locator('.readiness-item').count(),5);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     assert(!/readiness\./.test(await page.locator('.readiness-panel').innerText()));
   }
 }
 report.checks.push('All four lifecycle states and five checklist items render in EN/ES at 390px, without overflow or untranslated keys.');
 await page.screenshot({path:`${out}/checklist-mobile-es.png`,fullPage:true});
 assert.deepEqual(report.errors,[]);
} finally { await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)); await browser.close(); }
console.log(JSON.stringify(report,null,2));
