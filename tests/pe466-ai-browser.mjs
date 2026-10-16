// LOCAL SYNTHETIC API test: not DEV authorization/RLS evidence.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:18799',out=new URL('../test-results/pe466/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const uid='00000000-0000-4000-8000-000000000001',v='10000000-0000-4000-8000-000000000001';
const user={id:uid,email:'owner@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-01T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.fixture`,refresh_token:'fixture',expires_in:3600,expires_at:exp,token_type:'bearer',user};
const venue={id:v,name:'Harbor',slug:'harbor',is_owner:true,is_active:true};
let state={venue_id:v,nombre:'Harbor',revision:1,primera_activacion_en:null,habilitado:false,owners:[{owner_user_id:uid,email:user.email,nombre:'Owner One',habilitado:false,efectivo:false,motivo:'sede_desactivada'}],rate:{version:1,amount:'0.00',currency:'USD',interval:'month'},acceptance:{current:false,accepted_at:null,actor_user_id:null},capabilities:{can_manage:true,can_accept:true,acceptance_mode:'administrative'},endpoint:'https://mcp.dev.example.invalid/mcp',entorno:'dev',clientes:[]};
let saves=[],requests=[],admin=true,operations=false,mcpDetails=0,stale=false,errors=[];
const ctx=await browser.newContext({viewport:{width:1280,height:960},locale:'en'});
await ctx.addInitScript(s=>localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s)),session);
await ctx.route('https://fzwzmwstxlsxdzdmphyq.supabase.co/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;const body=req.postData()?req.postDataJSON():{};
 const send=(x,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(x)});
 if(path==='/auth/v1/user')return send(user);
 if(path==='/rest/v1/staff_profiles')return send({first_name:'Owner',last_name:'One'});
 if(path.endsWith('/is_platform_staff'))return send(admin||operations);
 if(path.endsWith('/portal_access'))return send({is_platform_staff:admin,platform_role:admin?'super_admin':operations?'operations':null,owner_venues:[venue]});
 if(path.endsWith('/portal_tenant_detail'))return send({venue,print_servers:[]});
 if(path.endsWith('/portal_owner_venues'))return send([venue]);
 if(path.endsWith('/mcp_admin_venues')){requests.push(body);return send({rows:[{venue_id:v,nombre:'Harbor',habilitado:state.habilitado,owners:1}],total:26,page:body.p_page,page_size:body.p_page_size});}
 if(path.endsWith('/mcp_admin_tenants'))return send([{owner_user_id:uid,email:user.email,nombre:'Owner One'}]);
 if(path.endsWith('/mcp_venue_detail')){mcpDetails++;return send(state);}
 if(path.endsWith('/mcp_venue_save')){
  saves.push(body.p_input);
  if(stale){state={...state,owners:state.owners.map(o=>({...o,efectivo:false,motivo:'aceptacion_pendiente'})),rate:{...state.rate,version:2,amount:'4.00'},acceptance:{...state.acceptance,current:false}};return send({code:'PT409',message:'mcp_rate_conflict'},409);}
  state={...state,revision:state.revision+1,primera_activacion_en:state.primera_activacion_en??(body.p_input.habilitado?new Date().toISOString():null),habilitado:body.p_input.habilitado,owners:state.owners.map(o=>({...o,habilitado:body.p_input.owners.find(x=>x.owner_user_id===o.owner_user_id).habilitado,efectivo:body.p_input.habilitado,motivo:body.p_input.habilitado?'habilitado':'sede_desactivada'})),acceptance:body.p_input.accept_monthly?{current:true,accepted_at:new Date().toISOString(),actor_user_id:uid}:state.acceptance};return send(state);
 }
 return send({code:'42501',message:'fixture unknown'},403);
});
const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));const pass=s=>console.log('PASS '+s);
// PE-466.3 focused UI contract checks. All API calls below are intercepted fixtures, NOT DEV evidence.
const report={environment:'LOCAL SYNTHETIC API; NOT DEV',checks:[],screenshots:[]};
try{
 await ctx.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto(origin+'/admin/mcp');
 await page.getByRole('button',{name:'Next page'}).click();
 await page.getByText('Page 2 of 2',{exact:true}).waitFor();
 const before=requests.length;
 await page.getByLabel('Search venue',{exact:true}).fill('Harbor');
 await page.getByRole('combobox',{name:/MCP status/}).selectOption('inactive');
 await page.getByLabel('Search owner',{exact:true}).fill('owner@example.invalid');
 await page.locator('#mcp-tenant-search').fill('owner@example.invalid');
 await page.locator('#mcp-tenant-select').selectOption(uid);
 assert.equal(requests.length,before,'editing any filter must not apply it');
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByText('Page 1 of 2',{exact:true}).waitFor();
 assert.deepEqual(requests.at(-1),{p_search:'Harbor',p_owner_search:'owner@example.invalid',p_tenant:uid,p_status:'inactive',p_page:1,p_page_size:25});
 await page.getByLabel('Search venue',{exact:true}).fill('Unapplied');
 await page.getByRole('button',{name:'Next page'}).click();
 await page.getByText('Page 2 of 2',{exact:true}).waitFor();
 assert.equal(requests.at(-1).p_search,'Harbor','pagination must use applied search');
 assert.equal(requests.at(-1).p_owner_search,'owner@example.invalid');
 report.checks.push('Search submits all four filters; starts page one; pagination retains applied filters despite unsaved draft.');
 // Keyboard traversal records a visible, discrete focus treatment on each filter control.
 await page.getByLabel('Search venue',{exact:true}).focus();
 for(let i=0;i<5;i++){
  const focus=await page.evaluate(()=>{const el=document.activeElement,s=getComputedStyle(el);return {tag:el.tagName,width:s.outlineWidth,style:s.outlineStyle,color:s.outlineColor};});
  assert.notEqual(focus.style,'none',JSON.stringify(focus));assert(parseFloat(focus.width)>=1&&parseFloat(focus.width)<=2,JSON.stringify(focus));
  await page.keyboard.press('Tab');
 }
 report.checks.push('Keyboard focus stays visible with 1–2px outline across directory controls.');
 await page.getByRole('link',{name:'View details'}).click();
 await page.getByTestId('mcp-venue-editor').waitFor();
 assert.equal(await page.getByTestId('mcp-endpoint').count(),1);
 assert.equal(await page.getByTestId('mcp-endpoint').innerText(),state.endpoint);
 await page.getByRole('button',{name:/Copy URL/i}).click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),state.endpoint);
 const adminEndpoint=await page.getByTestId('mcp-endpoint').innerText();
 await page.screenshot({path:new URL('admin.png',out).pathname,fullPage:true});report.screenshots.push('admin.png');
 const sw=page.getByRole('switch',{name:'Venue MCP',exact:true});
 for(const owner of await page.locator('.mcp-owner-list [role=switch]').all()){assert.equal(await owner.isChecked(),false);assert(await owner.isDisabled());}
 await sw.check();await page.getByRole('button',{name:'Save',exact:true}).click();
 const dialog=page.getByTestId('mcp-monthly-dialog');await dialog.waitFor();
 assert.match(await dialog.innerText(),/administrativ|on behalf/i);assert.match(await dialog.innerText(),/USD 0.00/);
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:/save/i}).click();
 await page.getByText('Changes saved.',{exact:true}).waitFor();
 assert(saves.at(-1).accept_monthly);assert.equal(Object.hasOwn(saves.at(-1),'actor_user_id'),false);
 report.checks.push('Administrative confirmation explicit at server-provided USD 0.00; payload never supplies actor identity. OFF owner switches masked and disabled.');
 admin=false;state={...state,capabilities:{...state.capabilities,acceptance_mode:'owner'}};
 await page.goto(origin+`/?venue=${v}&section=integrations`);await page.getByTestId('owner-integrations').waitFor();
 assert.equal(await page.getByTestId('mcp-endpoint').count(),1);assert.equal(await page.getByTestId('mcp-endpoint').innerText(),adminEndpoint);
 const clients=page.getByTestId('mcp-clients');
 for(const name of ['ChatGPT','Claude','Grok','Gemini']){await clients.getByText(name,{exact:true}).waitFor();}
 assert.equal(await clients.locator('img').count(),4);
 assert(await clients.locator('img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0)));
 assert.match(await page.getByTestId('owner-integrations').innerText(),/Beny/);
 await page.getByRole('button',{name:/Copy URL/i}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),adminEndpoint);
 assert.equal(await page.getByRole('button',{name:'AI',exact:true}).count(),1);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:new URL('owner.png',out).pathname,fullPage:true});report.screenshots.push('owner.png');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 report.checks.push('Owner and admin share one connection panel, exact same copied endpoint; four loaded logos with Beny attribution; owner AI navigation and mobile width.');
 assert.deepEqual(errors,[]);report.passed=true;
} catch(e){report.error=String(e);throw e;}
finally{report.requests=requests;await writeFile(new URL('ui-contract.json',out),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
