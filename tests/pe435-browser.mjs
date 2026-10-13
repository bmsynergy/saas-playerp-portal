import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799',out=process.env.SMOKE_OUTPUT_DIR??'test-results/pe435';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',venueId='22222222-2222-4222-8222-222222222222',date='2026-10-13T18:00:00Z';
const user={id:uid,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256'})}.${enc({sub:uid,exp,aud:'authenticated',role:'authenticated'})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const dev=i=>({id:`device-${i}`,serial:`PS-TEST000${i}`,hostname:`playerp-ps-test000${i}`,model:'rpi4-2gb',model_label:'Raspberry Pi 4 · 2 GB',arch:'arm64',label:`Desk ${i}`,status:i===0?'assigned':'stock',legacy:false,venue_id:i===0?venueId:null,venue_name:i===0?'Fixture Venue':null,print_server_id:i===0?'ps-0':null,software_version:i===2?null:i===1?'0.3.2':'0.3.1',created_at:date});
const report={origin,kind:'Synthetic intercepted API contracts; no live mutations',checks:[],errors:[]};
async function setup(width){
 const ctx=await browser.newContext({viewport:{width,height:1000},locale:'en'});await ctx.addInitScript(session=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale','en');},session);
 const s={devices:[dev(0),dev(1),dev(2)],calls:[],blocked:false,stable:true,updating:false,finished:false,failMove:false,failVenues:false};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url()),name=url.pathname.split('/').pop();if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(name==='user'?user:session);
  if(name==='staff_profiles')return send(null);
  const args=route.request().postDataJSON()??{};s.calls.push({name,args});
  if(name==='portal_access')return send({is_platform_staff:true,platform_role:'super_admin',owner_venues:[]});
  if(name==='is_platform_staff')return send(true);
  if(name==='portal_tenant_directory')return send([{id:venueId,name:'Fixture Venue',slug:'fixture',is_active:true}]);
  if(name==='portal_ps_devices')return send({ok:true,devices:s.devices});
  if(name==='portal_ps_inventory')return send({contract_version:1,generated_at:date,online_window_seconds:180,items:s.devices.map(d=>({id:d.id,device_id:d.id,label:d.label,hostname:d.hostname,assignment:d.venue_id?'assigned':'unassigned',venue_id:d.venue_id,venue_name:d.venue_name,last_venue_name:null,connection:d.venue_id?'online':'unassigned',last_seen_at:null,last_report_at:null,firmware_version:d.software_version,firmware_known:!!d.software_version,error_count:0,warning_count:0,printers_total:null,pending_jobs:null,last_issue_at:null,issues:[]}))});
  if(name==='ps_firmware_list')return send({releases:[],installed:[]});
  if(name==='ps_admin_device_models')return send({ok:true,default:{model:'future',label:'Future model',arch:'armhf'},models:[{model:'rpi4-2gb',label:'Raspberry Pi 4 · 2 GB',archs:['arm64'],default_arch:'arm64',active:true,is_default:false},{model:'future',label:'Future model',archs:['armhf','arm64'],default_arch:'armhf',active:true,is_default:true}]});
  if(name==='ps_admin_venue_search'){
   if(s.failVenues)return send({message:'Unavailable'},500);
   const all=[{id:venueId,name:'Fixture Venue',slug:'fixture',city:'San Juan',state:'PR',is_active:true,assigned_device:null},{id:'new-venue',name:'New Park',slug:'new-park',city:'Ponce',state:'PR',is_active:true,assigned_device:null}];
   return send({ok:true,venues:all.filter(v=>v.id===args.p_include_venue_id||!args.p_query||[v.name,v.slug,v.city,v.state].join(' ').toLowerCase().includes(args.p_query.toLowerCase()))});
  }
  if(name==='ps_admin_device_detail'||name==='ps_admin_device_manage'){const device=s.devices.find(d=>d.id===args.p_device_id);return send({ok:true,device,actions:{assign:{allowed:!device.venue_id,reason:null},move:{allowed:!!device.venue_id,reason:null},unassign:{allowed:!!device.venue_id,reason:null},delete:{allowed:!device.venue_id&&!s.blocked,confirm_with:'serial'}},update:{current_version:device.software_version,latest_stable:s.stable?{edition_id:'stable',version:'0.3.3',model:device.model,arch:device.arch}:null,update_available:s.stable&&!s.updating,reason:s.updating?'update_in_progress':s.stable?null:'no_stable_release',active_update:s.updating?{deployment_id:'single',status:'pending',phase:'queued',progress:0}:null},delete:{allowed:!device.venue_id&&!s.blocked,blockers:device.venue_id?['device_assigned']:s.blocked?['active_operation']:[]}});}
  if(name==='ps_admin_device_move'||name==='ps_admin_device_assign'){
   if(s.failMove)return send({ok:false,error:'unknown_venue'});
   const device=s.devices.find(d=>d.id===args.p_device_id);device.venue_id=args.p_venue_id;device.venue_name='New Park';device.status='assigned';device.print_server_id='ps-new';
   return send({ok:true,enrollment_code:'synthetic-code',expires_at:null,replaces_device_id:null});
  }
  if(name==='ps_admin_device_revoke'){
   const device=s.devices.find(d=>d.id===args.p_device_id);device.venue_id=null;device.venue_name=null;device.status='stock';device.print_server_id=null;return send({ok:true});
  }
  if(name==='ps_admin_device_create'){assert.equal(args.p_model,'future');assert.equal(args.p_arch,'armhf');assert.equal(args.p_label,'New desk');s.devices.push({...dev(3),model:'future',arch:'armhf',label:args.p_label});return send({ok:true,device:s.devices.at(-1)});}
  if(name==='ps_admin_device_delete'){assert.equal(args.p_confirm_serial,s.devices.find(d=>d.id===args.p_device_id).serial);s.devices=s.devices.filter(d=>d.id!==args.p_device_id);return send({ok:true,deleted_device_id:args.p_device_id});}
  if(name==='ps-ota-admin'){assert.deepEqual(args,{action:'update_device',device_id:'device-0',edition_id:'stable'});s.updating=true;return send({ok:true,deployment_id:'single',targets:1});}
  if(name==='ps_ota_admin_overview')return send({ok:true,keys:[],releases:[],groups:[],devices:s.devices.filter(d=>d.print_server_id).map(d=>({...d,installed_version:d.software_version})),deployments:[],audit:[]});
  if(name==='ps_ota_admin_deployments_page')return send({ok:true,total:2,items:[{id:'live',ring:'general',version:'0.3.3',created_at:date,target_count:2,target_by_status:s.finished?{committed:2}:{in_progress:1,committed:1}},{id:'done',ring:'general',version:'0.3.2',created_at:date,target_count:1,target_by_status:{failed:1}}],aggregates:{target_by_status:{in_progress:1,committed:1,failed:1}}});
  if(name==='ps_ota_admin_targets_page')return send({ok:true,total:1,items:[{id:'target-live',deployment_id:'live',print_server_id:'ps-0',hostname:'playerp-ps-test0000',venue_name:'Fixture Venue',status:'in_progress',phase:'verifying',progress:64,desired_version:'0.3.3',installed_version:'0.3.1',issued_at:date,updated_at:date}],aggregates:{target_by_status:{in_progress:1}}});
  if(name==='ps_ota_target_events')return send({ok:true,events:[{id:'event-live',phase:'verifying',status:'in_progress',progress:64,created_at:date,detail:'Verification running'}]});
  if(name==='ps_ota_admin_audit_page')return send({ok:true,total:0,items:[],aggregates:{}});
  report.errors.push(`Unexpected endpoint ${name}`);return route.abort();
 });
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.setDefaultTimeout(10000);return {ctx,page,s};
}
const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
try{
 for(const width of [390,834,1440]){
  const {ctx,page,s}=await setup(width);
  await page.goto(origin+'/admin/print-servers/inventory');await expect(page.getByTestId('devices-page')).toBeVisible();
  const filter=page.getByTestId('devices-filters');
  const controls=await filter.locator('input, select, button').evaluateAll(els=>els.map(e=>({id:e.dataset.testid??e.textContent.trim(),height:e.getBoundingClientRect().height,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
  assert.deepEqual(controls.map(c=>c.id),['devices-search','devices-status','devices-assignment','devices-version','devices-from','devices-to','Clear filters']);
  assert.ok(controls.every(c=>Math.abs(c.height-44)<1),JSON.stringify(controls));
  for(let i=1;i<controls.length;i++)assert.ok(controls[i].y>controls[i-1].y||controls[i].x>controls[i-1].x,'visual filter order');
  await page.getByTestId('devices-version').selectOption('0.3.2');await expect(filter.getByRole('button',{name:'Clear filters'})).toBeEnabled();await filter.getByRole('button',{name:'Clear filters'}).click();await expect(page.getByTestId('devices-version')).toHaveValue('');
  await page.getByTestId('devices-assignment').selectOption('unassigned');await expect(page.locator('[data-testid^="inv-row-"]')).toHaveCount(2);await filter.getByRole('button',{name:'Clear filters'}).click();await expect(page.locator('[data-testid^="inv-row-"]')).toHaveCount(3);
  assert.equal((await page.getByTestId('inv-create').innerText()).trim(),'Add Print Server');await expect(page.getByTestId('inv-create').locator('svg')).toHaveCount(1);
  await noOverflow(page);assert.ok(await page.locator('.inv-actions .button').evaluateAll(els=>els.every(e=>e.scrollWidth<=e.clientWidth)),'action text fits');await page.screenshot({path:`${out}/inventory-${width}.png`,fullPage:true});
  await page.getByTestId('inv-create').click();let dialog=page.getByTestId('admin-device-add-dialog');
  await expect(dialog.locator('select').nth(0)).toHaveValue('future');await expect(dialog.locator('select').nth(1)).toHaveValue('armhf');
  
  await page.getByTestId('inv-add-venue').fill('Ponce');await expect(dialog.getByRole('option',{name:/New Park/})).toBeVisible();await expect(dialog.getByRole('option',{name:/Fixture Venue/})).toHaveCount(0);await expect(dialog.getByRole('option',{name:'Not assigned',exact:true})).toBeVisible();
  await page.getByTestId('inv-add-venue').press('ArrowDown');await page.getByTestId('inv-add-venue').press('Enter');await expect(page.getByTestId('inv-add-venue')).toHaveValue('New Park');
  await page.getByTestId('inv-add-venue').click();await page.getByTestId('inv-add-venue').press('Escape');await expect(dialog).toBeVisible();await expect(page.getByTestId('inv-add-venue')).toHaveAttribute('aria-expanded','false');
  await page.getByTestId('inv-add-venue').click();await dialog.getByRole('option',{name:'Not assigned',exact:true}).click();
  await dialog.getByLabel('Label (optional)',{exact:true}).fill('New desk');await noOverflow(page);await dialog.screenshot({path:`${out}/add-${width}.png`});
  await dialog.getByRole('button',{name:'Review',exact:true}).click();assert.equal(s.calls.filter(c=>c.name==='ps_admin_device_create').length,0);await expect(dialog).toContainText('Future model');await expect(dialog).toContainText('Not assigned');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).toHaveCount(0);
  const row=page.getByTestId('inv-row-PS-TEST0000');assert.deepEqual(await row.getByRole('button').allTextContents(),['Open device sheet','Manage']);await expect(row.locator('select')).toHaveCount(0);
  await page.getByTestId('inv-open-PS-TEST0000').click();await expect(page.getByTestId('admin-device-summary')).toBeVisible();await page.keyboard.press('Escape');
  await page.getByTestId('inv-manage-PS-TEST0000').click();dialog=page.getByTestId('admin-device-manage-dialog');await expect(dialog).toContainText('Fixture Venue');await expect(dialog.getByRole('button',{name:/Delete/})).toHaveCount(0);await expect(page.getByTestId('inv-manage-assign')).toBeDisabled();
  await page.getByTestId('inv-manage-venue').fill('Ponce');await dialog.getByRole('option',{name:/New Park/}).click();await expect(page.getByTestId('inv-manage-assign')).toHaveText('Move');
  s.failMove=true;await page.getByTestId('inv-manage-assign').click();await expect(dialog.getByRole('alert')).toBeVisible();assert.equal(s.devices[0].venue_id,venueId);assert.equal(s.calls.filter(c=>['ps_admin_device_revoke','ps_admin_device_delete'].includes(c.name)).length,0);
  s.failMove=false;await page.getByTestId('inv-manage-assign').click();await expect(dialog).toHaveCount(0);await expect(page.getByTestId('inv-code')).toBeVisible();await page.getByTestId('inv-code-close').click();assert.equal(s.devices[0].venue_id,'new-venue');
  await page.getByTestId('inv-manage-PS-TEST0000').click();dialog=page.getByTestId('admin-device-manage-dialog');await expect(dialog).toContainText('New Park');await noOverflow(page);await dialog.screenshot({path:`${out}/manage-${width}.png`});
  await dialog.getByRole('button',{name:'Unassign',exact:true}).click();assert.equal(s.calls.filter(c=>c.name==='ps_admin_device_revoke').length,0);await expect(dialog).toHaveAttribute('role','alertdialog');await dialog.getByRole('button',{name:'Back',exact:true}).click();await expect(dialog).toHaveAttribute('role','dialog');
  await dialog.getByRole('button',{name:'Unassign',exact:true}).click();await dialog.getByRole('button',{name:'Unassign',exact:true}).click();await expect(dialog).toHaveCount(0);assert.equal(s.devices[0].venue_id,null);assert.equal(s.calls.filter(c=>c.name==='ps_admin_device_delete').length,0);await expect(row).toBeVisible();
  s.blocked=true;await page.getByTestId('inv-manage-PS-TEST0000').click();dialog=page.getByTestId('admin-device-manage-dialog');await expect(dialog.getByRole('combobox')).toBeVisible();await expect(dialog.getByRole('button',{name:/Delete/})).toHaveCount(0);await page.keyboard.press('Escape');s.blocked=false;
  await page.getByTestId('inv-manage-PS-TEST0000').click();dialog=page.getByTestId('admin-device-manage-dialog');await dialog.getByRole('button',{name:/Delete/}).click();await expect(dialog.getByRole('button',{name:'Delete',exact:true})).toBeDisabled();await dialog.getByRole('textbox').fill('wrong');await expect(dialog.getByRole('button',{name:'Delete',exact:true})).toBeDisabled();await dialog.getByRole('textbox').fill('PS-TEST0000');await dialog.getByRole('button',{name:'Delete',exact:true}).click();await expect(row).toHaveCount(0);
  await page.getByTestId('inv-manage-PS-TEST0001').click();dialog=page.getByTestId('admin-device-manage-dialog');await page.getByTestId('inv-manage-venue').fill('Ponce');await dialog.getByRole('option',{name:/New Park/}).click();await expect(page.getByTestId('inv-manage-assign')).toHaveText('Assign');await page.getByTestId('inv-manage-assign').click();await expect(dialog).toHaveCount(0);await page.getByTestId('inv-code-close').click();assert.equal(s.calls.filter(c=>c.name==='ps_admin_device_assign').length,1);
  await page.goto(origin+'/admin/print-servers/updates');const dep=page.getByTestId('ota-deployment-live');await expect(dep).toHaveAttribute('open','');await expect(page.getByTestId('ota-target-target-live')).toContainText('64%');await expect(dep.locator('.admin-list-filters')).toHaveCount(0);await expect(dep.locator('input[type="search"],input[type="date"]')).toHaveCount(0);await page.getByTestId('ota-events-toggle-target-live').click();await expect(dep.getByTestId('ota-events-target-live')).toContainText('64%');
  const request=s.calls.find(c=>c.name==='ps_ota_admin_targets_page');assert.equal(request.args.p_deployment_id,'live');assert.ok(!request.args.p_query&&!request.args.p_status&&!request.args.p_from&&!request.args.p_to);await noOverflow(page);await dep.screenshot({path:`${out}/deployment-${width}.png`});
  report.checks.push({width,criterion1:{directTargetsAndEvents:true,scopedDeployment:true,noInternalFilters:true},criterion2:{explicitDefaultSecondModel:'future/armhf',venueSearchCityAndKeyboard:true,singlePlus:true},criterion3:{order:controls.map(c=>c.id),uniformHeight:44,noOverflow:true,clearAssignmentAndVersion:true},criterion4:{cleanActions:true,assignAndAtomicMove:true,rejectedMoveKeptAssignment:true,separateUnassignAndDelete:true,serialConfirmation:true,blockedDeleteHidden:true}});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
