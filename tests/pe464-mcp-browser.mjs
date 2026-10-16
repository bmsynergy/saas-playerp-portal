// LOCAL SYNTHETIC API test: not DEV authorization/RLS evidence.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:18799',out=new URL('../test-results/pe464/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const uid='00000000-0000-4000-8000-000000000001',v='10000000-0000-4000-8000-000000000001';
const user={id:uid,email:'owner@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-01T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.fixture`,refresh_token:'fixture',expires_in:3600,expires_at:exp,token_type:'bearer',user};
const venue={id:v,name:'Harbor',slug:'harbor',is_owner:true,is_active:true};
let state={venue_id:v,nombre:'Harbor',revision:1,habilitado:false,owners:[{owner_user_id:uid,email:user.email,nombre:'Owner One',habilitado:false,efectivo:false,motivo:'sede_desactivada'}],rate:{version:1,amount:'0.00',currency:'USD',interval:'month'},acceptance:{current:false,accepted_at:null,actor_user_id:null},capabilities:{can_manage:true,can_accept:true},endpoint:null,entorno:'dev',clientes:[]};
let saves=[],requests=[],admin=true,stale=false,errors=[];
const ctx=await browser.newContext({viewport:{width:1280,height:960},locale:'en'});
await ctx.addInitScript(s=>localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s)),session);
await ctx.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;const body=req.postData()?req.postDataJSON():{};
 const send=(x,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(x)});
 if(path==='/auth/v1/user')return send(user);
 if(path==='/rest/v1/staff_profiles')return send({first_name:'Owner',last_name:'One'});
 if(path.endsWith('/is_platform_staff'))return send(admin);
 if(path.endsWith('/portal_access'))return send({is_platform_staff:admin,platform_role:admin?'super_admin':null,owner_venues:[venue]});
 if(path.endsWith('/portal_owner_venues'))return send([venue]);
 if(path.endsWith('/mcp_admin_venues')){requests.push(body);return send({rows:[{venue_id:v,nombre:'Harbor',habilitado:state.habilitado,owners:1}],total:26,page:body.p_page,page_size:body.p_page_size});}
 if(path.endsWith('/mcp_admin_tenants'))return send([{owner_user_id:uid,email:user.email,nombre:'Owner One'}]);
 if(path.endsWith('/mcp_venue_detail'))return send(state);
 if(path.endsWith('/mcp_venue_save')){
  saves.push(body.p_input);
  if(stale){state={...state,owners:state.owners.map(o=>({...o,efectivo:false,motivo:'aceptacion_pendiente'})),rate:{...state.rate,version:2,amount:'4.00'},acceptance:{...state.acceptance,current:false}};return send({code:'PT409',message:'mcp_rate_conflict'},409);}
  state={...state,revision:state.revision+1,habilitado:body.p_input.habilitado,owners:state.owners.map(o=>({...o,habilitado:body.p_input.owners.find(x=>x.owner_user_id===o.owner_user_id).habilitado,efectivo:body.p_input.habilitado,motivo:body.p_input.habilitado?'habilitado':'sede_desactivada'})),acceptance:body.p_input.accept_monthly?{current:true,accepted_at:new Date().toISOString(),actor_user_id:uid}:state.acceptance};return send(state);
 }
 return send({code:'42501',message:'fixture unknown'},403);
});
const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));const pass=s=>console.log('PASS '+s);
try{
 await page.goto(origin+'/admin/mcp');await page.getByRole('heading',{name:'MCP access by venue'}).waitFor();
 await page.getByRole('button',{name:'Next page'}).click();await page.getByText('Page 2 of 2',{exact:true}).waitFor();assert(requests.some(r=>r.p_page===2&&r.p_page_size===25));
 await page.getByRole('combobox',{name:/MCP status/}).selectOption('inactive');await page.getByLabel('Search venue',{exact:true}).fill('Harbor');await page.getByRole('button',{name:'View details'}).click();
 const sw=page.getByRole('switch',{name:'Venue MCP',exact:true});await sw.check();assert.equal(saves.length,0);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await sw.isChecked(),false);assert.equal(saves.length,0);pass('paged request, filters, edit/Cancel do not persist');
 await sw.check();await page.getByRole('switch',{name:'MCP for Owner One',exact:true}).check();await page.getByRole('button',{name:'Save',exact:true}).click();
 const dialog=page.getByTestId('mcp-monthly-dialog');await dialog.waitFor();assert.equal(await dialog.getByRole('checkbox').isChecked(),false);assert.equal(await dialog.getByRole('button',{name:'Accept and save'}).isEnabled(),false);assert((await dialog.innerText()).includes('USD 0.00'));
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Accept and save'}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();assert.equal(saves.length,1);assert.equal(saves[0].accept_monthly,true);pass('explicit monthly consent and atomic save payload');
 admin=false;await page.goto(origin+`/?venue=${v}&section=integrations`);await page.getByTestId('owner-integrations').waitFor();assert(await sw.isChecked());pass('owner surface same shared editor and persisted state');
 await sw.uncheck();page.once('dialog',d=>d.dismiss());await page.getByRole('link').first().click();assert(page.url().includes('integrations'));assert.equal(await sw.isChecked(),false);pass('navigation cancellation retains draft');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await sw.uncheck();stale=true;await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Reload',exact:true}).waitFor();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Reload',exact:true}).click();await page.getByRole('button',{name:'Accept current rate',exact:true}).waitFor();stale=false;
 await page.getByRole('button',{name:'Accept current rate',exact:true}).click();await dialog.waitFor();assert((await dialog.innerText()).includes('USD 4.00'));assert.equal(await dialog.getByRole('checkbox').isChecked(),false);pass('stale rate requires reload + new acceptance even with unchanged ON switches');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:new URL('owner-mobile.png',out).pathname,fullPage:true});assert.equal(errors.length,0,errors.join('\n'));pass('mobile without overflow or runtime errors');
 admin=true;state={...state,capabilities:{can_manage:true,can_accept:false}};await page.goto(origin+'/admin/mcp');await page.getByRole('button',{name:'View details'}).click();await page.getByText('Activation is pending acceptance by an owner of this venue.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isEnabled(),false);await page.getByRole('switch',{name:'MCP for Owner One',exact:true}).uncheck();await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Changes saved.',{exact:true}).waitFor();assert.equal(saves.at(-1).accept_monthly,false);assert.equal(saves.at(-1).habilitado,true);pass('individual OFF can save without accepting pending tariff');await sw.uncheck();assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isEnabled(),true);pass('SaaS cannot accept for owner; can always stage shutdown');
 await writeFile(new URL('requests.json',out),JSON.stringify({kind:'LOCAL MOCKED API; NOT DEV',requests,saves},null,2));
} finally {await browser.close();}
