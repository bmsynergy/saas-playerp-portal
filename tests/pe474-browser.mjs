// PE-474 browser fixtures. Every remote request is intercepted; no DEV data or OTA action is touched.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.PORTAL_TEST_ORIGIN ?? 'http://127.0.0.1:18799';
assert.equal(origin, 'http://127.0.0.1:18799', 'Fixtures run against the local test server only');
const out = 'docs/evidence/pe474';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const stamp='2026-10-17T20:00:00Z';
const uid='11111111-1111-4111-8111-111111111111',venue='22222222-2222-4222-8222-222222222222';
const user={id:uid,email:'fixture-pe474@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:stamp};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const sha='a'.repeat(64);
const RINGS=['lab','canary','general'];
const lc=(i,rings=i===0?['lab','canary']:i===1?[]:['lab'])=>{
 const signed=i!==3,enabled=signed?rings:[],next=!signed?null:!enabled.includes('lab')?'lab':!enabled.includes('canary')?'canary':!enabled.includes('general')?'general':null;
 return {contract_version:2,edition_id:signed?`fixture-edition-${i}`:null,edition_status:signed?'signed':null,signed_by:signed?uid:null,signed_by_email:signed?user.email:null,signed_at:signed?stamp:null,key_id:signed?'fixture-key':null,
  enabled_rings:enabled,revision:i===0?4:0,configuration:i===1?'legacy':i===0||i===3?'explicit':'auto_lab',retired_at:null,retired_by:null,open_targets:0,lab_only:false,
  technical_class:signed?{ring:'general',general_eligible:true,eligibility_reason:'general'}:null,canary_confirmed_at:null,canary_evidence:{confirmed_at:null,committed_canary_targets:0,blocking:false},
  rings:Object.fromEntries(RINGS.map(r=>[r,{enabled:enabled.includes(r),eligible:signed,reason:signed?null:'edition_not_signed',available:enabled.includes(r),can_enable:r===next,enable_block_reason:r===next?null:enabled.includes(r)?'already_enabled':r==='general'?'canary_required':r==='canary'?'lab_required':'edition_not_signed'}])),next_promotion:next,
  can_sign:!signed,sign_block_reason:signed?'already_signed':null,can_manage:signed,can_retire:signed,retire_block_reason:null};
};
const release=i=>({id:`fixture-release-${i}`,version:i===0?'0.3.23':i===1?'0.3.24':`10.0.${i}`,revision:null,model:'rpi4-2gb',arch:'arm64',notes:'Fixture only',filename:`fixture-${i}.zip`,size_bytes:1234567,sha256:sha,status:'ready',validation:{errors:[],entries:3},created_at:stamp,uploaded_by_email:user.email,installed_count:0,lifecycle:i===2?{...lc(i),contract_version:1}:lc(i)});
const channel=i=>({print_server_id:`ps-${i}`,device_id:`device-${i}`,serial:`PS-FIXTURE-${i}`,name:`Fixture server ${i}`,hostname:`fixture-${i}`,venue_id:venue,venue_name:'Fixture Venue',channel:i===0?'lab':i===1?'canary':'general',channel_revision:i===0?7:0,channel_source:'admin',channel_updated_at:stamp,status:'active',online:i%2===0,last_seen_at:stamp,installed_version:'0.3.22',model:'rpi4-2gb',arch:'arm64',update_in_progress:false,href:`/admin/print-servers/devices/device-${i}`});
const report={kind:'PE-474 isolated browser fixtures; all Supabase requests intercepted; no live writes or physical OTA',checks:[],network:[],writes:[],unexpected:[]};
async function setup(width,lang,owner=false){
 const ctx=await browser.newContext({viewport:{width,height:950},locale:lang});
 await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
 const state={promoteMode:'ok',channelMode:'conflict',failFirmware:false,release0:release(0),release1:release(1),calls:[]};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
  if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.abort();
  if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co'){report.unexpected.push(url.href);return route.abort();}
  const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  const args=req.postDataJSON()??{};state.calls.push({name,args});report.network.push({name,args});
  if(name==='is_platform_staff')return send(!owner);
  if(name==='portal_access')return send({is_platform_staff:!owner,platform_role:owner?null:'super_admin',owner_venues:owner?[{id:venue,name:'Fixture Venue',slug:'fixture',is_owner:true}]:[]});
  if(name==='portal_owner_venues')return send([{id:venue,name:'Fixture Venue',slug:'fixture',is_owner:true}]);
  if(name==='portal_tenant_directory')return send([]);
  if(name==='ps_admin_venue_search')return send({ok:true,venues:[{id:venue,name:'Fixture Venue',slug:'fixture',city:'San Juan',state:'PR',is_active:true,assigned_device:null}]});
  if(name==='ps_firmware_page'){
   assert.ok(args.p_limit<=100&&args.p_limit>0&&args.p_offset>=0);
   if(state.failFirmware)return send({message:'fixture failure'},503);
   const specials=[state.release0,state.release1,release(2),release(3)];
   let all=Array.from({length:2000},(_,i)=>i<4?specials[i]:release(i));
   if(args.p_status==='signed')all=all.filter(r=>r.lifecycle?.edition_status==='signed'&&!r.lifecycle?.retired_at);
   if(args.p_status==='unsigned')all=all.filter(r=>r.lifecycle?.can_sign);
   if(args.p_query)all=all.filter(r=>[r.version,r.filename,r.notes].some(x=>x?.toLowerCase().includes(String(args.p_query).toLowerCase())));
   if(args.p_ring)all=all.filter(r=>args.p_ring==='none'?r.lifecycle?.enabled_rings.length===0:r.lifecycle?.enabled_rings.includes(args.p_ring));
   return send({ok:true,total:all.length,limit:args.p_limit,offset:args.p_offset,releases:all.slice(args.p_offset,args.p_offset+args.p_limit),server_time:stamp});
  }
  if(name==='ps_ota_channels_page'){
   assert.ok(args.p_limit<=100&&args.p_offset>=0);
   let all=Array.from({length:2000},(_,i)=>channel(i));
   if(args.p_query)all=all.filter(r=>[r.serial,r.name,r.hostname].some(x=>x.includes(String(args.p_query))));
   if(args.p_channel)all=all.filter(r=>r.channel===args.p_channel);
   if(args.p_group_id)all=all.slice(0,54);
   return send({ok:true,total:all.length,limit:args.p_limit,offset:args.p_offset,counts:{lab:1,canary:1,general:all.length-2},rows:all.slice(args.p_offset,args.p_offset+args.p_limit),server_time:stamp});
  }
  if(name==='ps_ota_admin_overview')return send({ok:true,contract_version:2,keys:[],totals:{releases:2000,devices:2000,deployments:60,open_targets:0,channels:{lab:1,canary:1,general:1998}},groups:[{id:'fixture-group',name:'Fixture rollout',ring:'lab',kind:'deployment',member_count:54,created_at:stamp}],deployments:[],audit:[],audit_included:false,server_time:stamp});
  if(name==='ps_ota_admin_deployments_page')return send({ok:true,total:60,limit:args.p_limit,offset:args.p_offset,items:Array.from({length:Math.min(args.p_limit,60-args.p_offset)},(_,j)=>({id:`deployment-${args.p_offset+j}`,ring:'lab',group_id:'fixture-group',group_name:'Fixture rollout',edition_id:'fixture-edition-0',version:'0.3.23',created_at:stamp,created_by_email:user.email,target_count:2,target_by_status:{committed:2}})),aggregates:{target_by_status:{committed:120},target_count:120}});
  if(name==='ps_ota_admin_targets_page'||name==='ps_ota_admin_events_page'||name==='ps_ota_admin_audit_page')return send({ok:true,total:0,limit:args.p_limit,offset:args.p_offset,items:[],aggregates:{}});
  if(name==='ps_ota_edition_promote'){
   report.writes.push({name,args});
   assert.equal(args.p_edition_id,state.release0.lifecycle.edition_id);assert.equal(args.p_ring,'general');assert.equal(args.p_expected_revision,4);
   if(state.promoteMode==='conflict')return send({ok:false,error:'availability_changed',revision:5,enabled_rings:['lab','canary']});
   state.release0.lifecycle=lc(0,['lab','canary','general']);state.release0.lifecycle.revision=5;
   return send({ok:true,edition_id:args.p_edition_id,revision:5,enabled_rings:['lab','canary','general'],retired_at:null,lifecycle:state.release0.lifecycle});
  }
  if(name==='ps-ota-admin'){
   report.writes.push({name,args});
   if(args.action==='set_channel'){
    assert.equal(args.print_server_id,'ps-0');assert.equal(args.channel,'canary');assert.equal(args.expected_channel,'lab');assert.equal(args.expected_revision,7);assert.equal(Object.hasOwn(args,'group_id'),false);
    return send({ok:false,error:state.channelMode==='conflict'?'channel_changed':'update_in_progress',channel:'general',revision:8},409);
   }
   if(args.action==='deploy'){assert.equal(args.edition_id,'fixture-edition-0');assert.equal(args.group_id,'fixture-group');return send({ok:false,error:'device_channel_not_enabled',devices:[{print_server_id:'ps-0',channel:'lab',installed_version:'0.3.22',reason:'device_channel_not_enabled'}]},409);}
   report.unexpected.push(`Unexpected OTA action ${args.action}`);return send({ok:false,error:'fixture_unexpected'},400);
  }
  report.unexpected.push(name);return send({ok:false,error:'fixture_unexpected'},400);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.unexpected.push(`pageerror: ${e.message}`));
 return {ctx,page,state};
}
const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
try{
 for(const [width,lang] of [[1440,'en'],[390,'es']]){
  const {ctx,page,state}=await setup(width,lang);
  await page.goto(`${origin}/admin/print-servers/firmwares?lang=${lang}`);
  await expect(page.getByTestId('firmwares-page')).toBeVisible();
  await expect(page.getByTestId('fw-release-list').locator(':scope > li')).toHaveCount(25);
  await expect(page.getByTestId('fw-releases-pagination-range')).toContainText(lang==='es'?'2000':'2,000');
  await page.getByTestId('fw-releases-pagination-next').click();
  await expect(page.getByTestId('fw-row-fixture-release-25')).toBeVisible();
  await page.getByTestId('fw-releases-pagination-prev').click();
  await page.getByTestId('fw-open-fixture-release-0').click();
  await expect(page.getByTestId('fw-promote-fixture-release-0-general')).toBeVisible();
  await expect(page.getByTestId('fw-detail-fixture-release-0')).toContainText(lang==='es'?'Acuses de instalación en Canary':'Canary installation acknowledgments');
  const before={id:state.release0.lifecycle.edition_id,hash:state.release0.sha256,version:state.release0.version,key:state.release0.lifecycle.key_id};
  state.promoteMode='conflict';
  await page.getByTestId('fw-promote-fixture-release-0-general').click();
  await page.getByRole('button',{name:lang==='es'?'Confirmar':'Confirm',exact:true}).last().click();
  await expect(page.getByTestId('fw-availability-description')).toHaveCount(0);
  await expect(page.getByText(lang==='es'?'La disponibilidad cambió. Actualiza e inténtalo de nuevo.':'Availability changed. Refresh and try again.')).toBeVisible();
  state.promoteMode='ok';await page.getByTestId('fw-promote-fixture-release-0-general').click();
  await page.getByRole('button',{name:lang==='es'?'Confirmar':'Confirm',exact:true}).last().click();
  await expect(page.getByTestId('fw-ring-fixture-release-0-general')).toHaveAttribute('data-enabled','true');
  assert.deepEqual({id:state.release0.lifecycle.edition_id,hash:state.release0.sha256,version:state.release0.version,key:state.release0.lifecycle.key_id},before);
  await page.getByTestId('fw-open-fixture-release-1').click();
  await expect(page.getByTestId('fw-no-rings-fixture-release-1')).toBeVisible();
  await expect(page.getByTestId('fw-promote-fixture-release-1-lab')).toBeVisible();
  await page.getByTestId('fw-open-fixture-release-2').click();
  await expect(page.getByTestId('fw-state-fixture-release-2')).toContainText(lang==='es'?'Datos del ciclo de vida no disponibles':'Lifecycle data unavailable');
  await expect(page.getByTestId('fw-detail-fixture-release-2')).toContainText(lang==='es'?'información de lifecycle':'Lifecycle');
  await noOverflow(page);
  await page.screenshot({path:`${out}/fixture-firmwares-${lang}-${width}.png`,fullPage:true});
  await page.getByTestId('ps-tab-channels').click();
  await expect(page.getByTestId('channels-page')).toBeVisible();
  await expect(page.getByTestId('channels-pagination-range')).toContainText(lang==='es'?'2000':'2,000');
  await page.getByTestId('channels-pagination-next').click();
  await expect(page.getByTestId('channel-row-ps-25')).toBeVisible();
  await page.getByTestId('channels-pagination-prev').click();
  await page.getByTestId('channel-row-ps-0').getByRole('combobox').selectOption('canary');
  await expect(page.getByTestId('admin-device-channel-dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toContainText(lang==='es'?'No se instala nada':'Nothing is installed');
  await page.getByRole('alertdialog').getByRole('button',{name:lang==='es'?'Confirmar':'Confirm'}).click();
  await expect(page.getByText(lang==='es'?'El canal cambió mientras tanto. Recarga y vuelve a intentarlo.':'The device channel changed meanwhile. Refresh and try again.')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:`${out}/fixture-channels-${lang}-${width}.png`,fullPage:true});
  await page.getByTestId('ps-tab-updates').click();
  await expect(page.getByTestId('updates-page')).toBeVisible();
  await expect(page.getByTestId('ota-deploy-catalog-pagination-range')).toContainText(lang==='es'?'1999':'1,999');
  await expect(page.getByTestId('deployments-pagination-range')).toContainText('60');
  await page.getByTestId('deployments-pagination-next').click();
  await expect(page.getByTestId('ota-deployment-deployment-25')).toBeVisible();
  await page.getByTestId('ota-deploy-edition-fixture-release-0').check();
  await page.locator('select').filter({has:page.locator('option[value="fixture-group"]')}).selectOption('fixture-group');
  page.once('dialog',dialog=>void dialog.accept());
  await page.getByTestId('ota-deploy-submit').click();
  await expect(page.getByTestId('ota-result')).toContainText(lang==='es'?'Algunos aparatos están en un canal':'Some devices are on a channel');
  await expect(page.getByTestId('ota-result').locator('a[href*="channels?q=ps-0"]')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:`${out}/fixture-updates-${lang}-${width}.png`,fullPage:true});
  state.failFirmware=true;
  await page.getByTestId('ota-deploy-catalog-search').fill('0.3.23');
  await expect(page.getByRole('alert')).toBeVisible();
  report.checks.push({width,lang,firmware:'v2 promotion to General without Canary ACK; immutable identity; legacy Lab offered; v1 metadata fails closed',channels:'server pagination and revision/channel confirmation; concurrent rejection; no group_id',updates:'server firmware and deployment pages; all-or-nothing rejection lists linked device and translated reason; catalogue read failure visible',layout:'no horizontal overflow'});
  await ctx.close();
 }
 const {ctx,page,state}=await setup(1440,'en',true);
 await page.goto(`${origin}/admin/print-servers/channels`);
 await expect(page.getByTestId('channels-page')).toHaveCount(0);
 assert.equal(state.calls.filter(c=>c.name==='ps_ota_channels_page').length,0,'Owner never queries admin channels');
 await ctx.close();
 const disallowed=new Set(['ps_firmware_list','portal_ps_inventory','ps_ota_target_events']);
 assert.equal(report.network.filter(n=>disallowed.has(n.name)).length,0,'No hidden complete-list requests');
 assert.ok(report.network.filter(n=>['ps_firmware_page','ps_ota_channels_page','ps_ota_admin_deployments_page'].includes(n.name)).every(n=>n.args.p_limit<=100),'Every list read has a server bound');
 assert.deepEqual(report.unexpected,[]);
 await writeFile(`${out}/browser-fixtures.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checks:report.checks,requestCount:report.network.length,writes:report.writes.length,unexpected:report.unexpected},null,2));
} finally {await browser.close();}
