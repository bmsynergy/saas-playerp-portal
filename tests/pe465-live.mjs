// PE-465: real DEV navigation/editor check and one opt-in transition. No mocks.
// RUN_MCP_TRANSITION=1 only on published DEV; changes the existing US Test Venue fixture.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app','http://127.0.0.1:18799'].includes(origin));
const transition=process.env.RUN_MCP_TRANSITION==='1';
if(transition)assert.equal(origin,'https://playerp.dev.bmore.app');
const accounts=JSON.parse(await readFile((process.env.PORTAL_DEV_FIXTURES??'/home/coredev/.coredeva-private/pe321-portal-dev')+'/cuentas.json','utf8'));
const config=await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');
const key=config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1],api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const out=new URL('../test-results/pe465/',import.meta.url);await mkdir(out,{recursive:true});
const report={origin,mocks:false,startedAt:new Date().toISOString(),navigation:[],editor:[],transition:[],cleanup:null};
const v='7c0f986f-2f28-4238-9080-279be48a0cc1',w='c1700000-0000-0000-0000-0000000000a0';
const sessions=[];let initial=null,mutated=false,owner;
async function login(profile){const r=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:accounts[profile].email,password:accounts[profile].password})});assert.equal(r.status,200,profile);const s=await r.json();sessions.push(s);return s;}
async function rpc(s,name,body){const r=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200,name);return r.json();}
const detail=()=>rpc(owner,'mcp_venue_detail',{p_venue_id:v});
const prefs=d=>Object.fromEntries(d.owners.map(o=>[o.owner_user_id,o.habilitado]));
const snapshot=d=>({revision:d.revision,habilitado:d.habilitado,primera_activacion_en:d.primera_activacion_en,preferences:prefs(d),effective:d.owners.map(o=>({id:o.owner_user_id,on:o.efectivo,reason:o.motivo})),rate:d.rate,accepted:d.acceptance.current});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
async function page(s){const ctx=await browser.newContext({viewport:{width:1440,height:1080},locale:'en'});await ctx.addInitScript(s=>{localStorage.setItem('playerp.locale','en');if(s)localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));},s);const p=await ctx.newPage();p.setDefaultTimeout(20000);return {ctx,p};}
const switches=p=>p.locator('.mcp-owner-list [role="switch"]');
async function masked(p,count){assert.equal(await switches(p).count(),count);for(const sw of await switches(p).all()){assert.equal(await sw.isChecked(),false);assert.equal(await sw.isDisabled(),true);}}
async function save(p){const r=p.waitForResponse(r=>r.url().endsWith('/rpc/mcp_venue_save'));await p.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await r).status(),200);await p.getByText('Changes saved.',{exact:true}).waitFor();}
try{
 const staff=await login('staff_activo');owner=await login('owner_varios');
 const {ctx,p}=await page(staff);
 await p.goto(origin+'/admin/mcp');await p.getByLabel('Search venue',{exact:true}).fill('WI170P1');await p.getByRole('button',{name:'Search',exact:true}).click();
 await p.getByRole('link',{name:'WI170P1 Venue',exact:true}).click();
 await p.getByTestId('mcp-venue-editor').waitFor();assert.equal(new URL(p.url()).pathname,`/admin/tenants/${w}/mcp`);
 assert.equal(await p.getByTestId('venue-mcp-tab').getAttribute('aria-current'),'page');
 await p.getByRole('heading',{name:'WI170P1 Venue',level:1}).waitFor();assert.equal(await p.getByTestId('mcp-venue-editor').count(),1);
 report.navigation.push({from:'/admin/mcp',to:new URL(p.url()).pathname,normalHeader:true,activeTab:'MCP',editors:1});
 await p.locator('.detail-tabs a').first().click();await p.getByTestId('venue-mcp-tab').click();await p.getByTestId('mcp-venue-editor').waitFor();report.navigation.push({from:'venue normal navigation',to:new URL(p.url()).pathname,editors:1});
 const order=await p.locator('.mcp-editor-grid > .mcp-editor-card h4').allTextContents();assert.equal(order.length,3);assert.equal(await p.locator('.mcp-editor-grid > .mcp-editor-card').first().getByRole('switch',{name:'Venue MCP',exact:true}).count(),1);assert(order[1].includes('subscription'));assert(order[2].includes('Owners'));
 const positions=await p.locator('.mcp-editor-grid > .mcp-editor-card').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().top));assert(positions[0]<positions[1]&&positions[1]<positions[2]);const saveBox=await p.getByRole('button',{name:'Save',exact:true}).boundingBox();assert(saveBox.y>positions[2]);
 const before=await rpc(staff,'mcp_venue_detail',{p_venue_id:w});await masked(p,before.owners.length);
 let saves=0;p.on('request',r=>{if(r.url().endsWith('/rpc/mcp_venue_save'))saves++;});
 await p.getByRole('switch',{name:'Venue MCP',exact:true}).check();assert.equal(saves,0);await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(saves,0);await masked(p,before.owners.length);
 const after=await rpc(staff,'mcp_venue_detail',{p_venue_id:w});assert.deepEqual(snapshot(after),snapshot(before));
 report.editor.push({order:['venue','subscription','owners','Save'],editsPersistBeforeSave:false,cancelPreservesBackend:true,offMaskedAndDisabled:true,rate:before.rate,accepted:before.acceptance.current});
 await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(200);await p.screenshot({path:new URL('admin-mcp.png',out).pathname,fullPage:true});await ctx.close();
 // Real login callback must keep the new deep link.
 const auth=await page(null);await auth.p.goto(origin+`/admin/tenants/${w}/mcp`);await auth.p.getByLabel('Email address',{exact:true}).fill(accounts.staff_activo.email);await auth.p.getByLabel('Password',{exact:true}).fill(accounts.staff_activo.password);await auth.p.getByRole('button',{name:'Sign in',exact:true}).click();await auth.p.getByTestId('mcp-venue-editor').waitFor();assert.equal(new URL(auth.p.url()).pathname,`/admin/tenants/${w}/mcp`);report.navigation.push({from:'anonymous deep link → login',to:new URL(auth.p.url()).pathname,preserved:true});
 const authSession=await auth.p.evaluate(()=>JSON.parse(localStorage.getItem('playerp.portal.dev.auth')));sessions.push(authSession);await auth.ctx.close();
 const own=await page(owner);await own.p.goto(origin+`/?venue=${w}&section=integrations`);await own.p.getByTestId('owner-integrations').waitFor();assert.equal(await own.p.getByTestId('mcp-venue-editor').count(),1);await masked(own.p,before.owners.length);report.navigation.push({from:'owner self-service',to:new URL(own.p.url()).pathname+new URL(own.p.url()).search,editors:1,offMaskedAndDisabled:true});
 await own.p.setViewportSize({width:390,height:844});assert(await own.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await own.p.screenshot({path:new URL('owner-mobile.png',out).pathname,fullPage:true});
 if(transition){
  await own.p.setViewportSize({width:1440,height:1080});await own.p.goto(origin+`/?venue=${v}&section=integrations`);await own.p.getByTestId('mcp-venue-editor').waitFor();initial=await detail();assert.equal(initial.primera_activacion_en,null,'fixture must never have been activated');assert.equal(initial.habilitado,false);assert(initial.owners.length>=2);await masked(own.p,initial.owners.length);
  const venueSwitch=own.p.getByRole('switch',{name:'Venue MCP',exact:true});await venueSwitch.check();for(const sw of await switches(own.p).all()){assert(await sw.isChecked());assert(await sw.isDisabled());}
  assert.deepEqual(snapshot(await detail()),snapshot(initial),'draft has no backend effect');
  await own.p.getByRole('button',{name:'Save',exact:true}).click();const dialog=own.p.getByTestId('mcp-monthly-dialog');await dialog.waitFor();assert((await dialog.innerText()).includes('USD 0.00'));assert(await dialog.getByRole('button',{name:'Accept and save'}).isDisabled());await dialog.getByRole('checkbox').check();
  const saved=own.p.waitForResponse(r=>r.url().endsWith('/rpc/mcp_venue_save'));mutated=true;await dialog.getByRole('button',{name:'Accept and save'}).click();assert.equal((await saved).status(),200);await own.p.getByText('Changes saved.',{exact:true}).waitFor();
  const activated=await detail();assert(activated.primera_activacion_en);assert(activated.acceptance.current);assert(activated.owners.every(o=>o.habilitado));report.transition.push({step:'first accepted activation, all current owners enabled',...snapshot(activated)});
  await switches(own.p).nth(1).uncheck();await save(own.p);const mixed=await detail();assert.equal(Object.values(prefs(mixed)).filter(x=>!x).length,1);report.transition.push({step:'saved mixed preferences',...snapshot(mixed)});
  await venueSwitch.uncheck();await masked(own.p,mixed.owners.length);await save(own.p);await masked(own.p,mixed.owners.length);const off=await detail();assert.equal(off.habilitado,false);assert.deepEqual(prefs(off),prefs(mixed));assert(off.owners.every(o=>!o.efectivo&&o.motivo==='sede_desactivada'));report.transition.push({step:'global OFF: UI all OFF disabled, backend effective OFF for all, preferences intact',...snapshot(off)});
  await own.p.reload();await own.p.getByTestId('mcp-venue-editor').waitFor();await masked(own.p,mixed.owners.length);await venueSwitch.check();const ui=await switches(own.p).evaluateAll(xs=>xs.map(x=>x.checked));assert.equal(ui.filter(x=>!x).length,1);await save(own.p);const restored=await detail();assert.deepEqual(prefs(restored),prefs(mixed));assert.equal(restored.primera_activacion_en,activated.primera_activacion_en);report.transition.push({step:'reactivation restores mixed preferences, previously OFF owner stays OFF',...snapshot(restored)});
 }
 await own.ctx.close();report.passed=true;
} catch(e){report.error=String(e.message);throw e;}
finally{
 if(mutated&&initial){const d=await detail();await rpc(owner,'mcp_venue_save',{p_input:{venue_id:v,operation_id:crypto.randomUUID(),expected_revision:d.revision,rate_version:d.rate.version,habilitado:initial.habilitado,accept_monthly:false,owners:d.owners.map(o=>({owner_user_id:o.owner_user_id,habilitado:prefs(initial)[o.owner_user_id]??o.habilitado}))}});const clean=await detail();assert.equal(clean.habilitado,initial.habilitado);assert.deepEqual(prefs(clean),prefs(initial));report.cleanup={globalAndPreferencesRestored:true,firstAcceptanceAndActivationRetained:true,reason:'immutable audit and acceptance from the authorized DEV fixture test'};}
 for(const s of sessions)await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+s.access_token}});
 report.completedAt=new Date().toISOString();await writeFile(new URL(transition?'transition.json':'navigation-editor.json',out),JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify(report,null,2));
