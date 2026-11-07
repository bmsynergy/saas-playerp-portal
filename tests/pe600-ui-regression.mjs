// Published DEV only. All action responses are synthetic; no real kit_download (it audits).
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {origin,qaId,out,login,launch,context,guard,assertGuard} from './helpers/pe600-readonly.mjs';
import {stockSheet} from './fixtures/pe469.mjs';
const report={origin,device:'PS-MWAG9DH2',deviceId:qaId,kind:'Real read-only catalog and device; synthetic image/file/assignment/email actions',checks:[],errors:[]};
const browser=await launch();let ctx;
const record=(name,data={})=>{report.checks.push({name,...data});console.log('PASS '+name);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const reply=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
try{
 const session=await login();
 const guardCtx=await context(browser,session),guardProof={};await guard(guardCtx,guardProof);
 const probe=await guardCtx.newPage();await probe.goto(origin+'/');
 await probe.evaluate(async()=>{for(const [path,body] of [['rest/v1/rpc/ps_admin_device_unlink',{p_device_id:'synthetic_guard_probe'}],['functions/v1/ps-firmware-admin',{action:'kit_download',id:'synthetic_guard_probe'}]])await fetch('https://fzwzmwstxlsxdzdmphyq.supabase.co/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).catch(()=>{});});
 assert.equal(guardProof.blocked.filter(x=>x.path.endsWith('ps_admin_device_unlink')||x.action==='kit_download').length,2);
 assert.throws(()=>assertGuard(guardProof));await guardCtx.close();
 record('Guardian self-test aborts unlink and real kit_download before network access',{aborted:2,realMutations:0});
 ctx=await context(browser,session);await guard(ctx,report);
 const page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
 const real={};const observe=async res=>{try{if(!res.ok())return;const name=new URL(res.url()).pathname.split('/').at(-1);if(['ps_device_resolve','ps_admin_stock_status','ps_firmware_list'].includes(name))real[name]=await res.json();if(name==='ps-firmware-admin'&&res.request().postDataJSON()?.action==='kit_list')real.kits=await res.json();}catch{/* Navigation may cancel a response body. */}};page.on('response',observe);
 await page.goto(origin+'/admin/print-servers/devices/'+qaId);await expect(page.getByTestId('ps-stock-state')).toBeVisible({timeout:30000});
 await expect.poll(()=>!!real.kits&&!!real.ps_firmware_list).toBe(true);
 assert.equal(real.ps_device_resolve.serial,'PS-MWAG9DH2');
 const releases=real.ps_firmware_list.releases;
 const compatible=real.kits.kits.filter(k=>k.kind==='bootable_image'&&k.profile==='dev'&&releases.some(r=>r.id===k.release_id&&r.status==='ready'&&r.model===real.ps_admin_stock_status.model&&r.arch===real.ps_admin_stock_status.arch&&/^0\.3\.(2[7-9]|[3-9]\d)$/.test(r.version)));
 if(!compatible.length){await expect(page.getByTestId('ps-stock-download-image')).toHaveCount(0);await expect(page.getByTestId('ps-stock')).toContainText('Aún no hay imagen DEV compatible');}
 record('Real QA device and image catalog read without actions',{kits:real.kits.kits.length,compatible:compatible.length,noImage:compatible.length===0});
 assertGuard(report);page.off('response',observe);
 // Remaining work runs against local responses, retaining the real QA identity only.
 const realReads=[...report.reads];let phase='file',assigned=false;const intercepted=[];
 const d=structuredClone(real.ps_device_resolve),stock=structuredClone(real.ps_admin_stock_status),when=new Date().toISOString();
 const fixtureVenue={id:'f6000000-0000-4000-8000-000000000001',name:'PE600 synthetic venue',slug:'pe600-fixture',city:null,state:null,is_active:true,assigned_device:null};
 Object.assign(d,{runtime:null,requested_runtime:null,venue:null,legacy:false,lifecycle:'stock'});
 Object.assign(d.link,{venue_id:null,venue_name:null,print_server_id:null,prepared:false,legacy:false,lifecycle:'stock',state:'pendiente_preparacion',sync:null,preparation:{state:'not_started',code_expires_at:null,prepared_at:null}});
 d.capabilities.assign={allowed:true,reason:null};
 Object.assign(stock,{venue_id:null,legacy:false,lifecycle:'stock'});Object.assign(stock.stock,{state:'not_prepared',file:null,credential:null,label_ready:false,next_step:'download_file'});
 const file=JSON.stringify({profile:'dev',device:{inventory_id:qaId,serial:d.serial},workshop_network:{mode:'ethernet_dhcp'},enrollment:{code:'pse_SYNTHETIC_ONLY_NEVER_SENT'},maintenance:{admin_code:'SYNTHETIC-ONLY'}});
 const smallImage=Buffer.from('PE600 synthetic download fixture; not an installable image.\n');
 const kit={id:'f6000000-0000-4000-8000-000000000002',kind:'bootable_image',release_id:'f6000000-0000-4000-8000-000000000003',release_version:'0.3.27',profile:'dev',file_name:'pe600-synthetic.img.xz',bytes:smallImage.length,sha256:hash(smallImage),created_at:when,base_image_name:'synthetic-base.img'};
 await ctx.unroute('**/*');
 await guard(page,report,async(route,{u,body,name,req})=>{
  if(u.origin===origin&&u.pathname==='/__pe600_synthetic_image') {await route.fulfill({status:200,headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="pe600-synthetic.img.xz"'},body:smallImage});return true;}
  if(u.origin!=='https://fzwzmwstxlsxdzdmphyq.supabase.co')return false;
  if(name==='ps_device_resolve'&&body?.p_id===qaId){await reply(route,d);return true;}
  if(name==='ps_device_link_status'&&body?.p_device_id===qaId){await reply(route,{ok:true,link:d.link});return true;}
  if(name==='ps_admin_stock_status'&&body?.p_device_id===qaId){await reply(route,stock);return true;}
  if(name==='ps_admin_device_sheet'&&body?.p_device_id===qaId){await reply(route,stockSheet(d));return true;}
  if(name==='ps-firmware-admin'&&body?.action==='kit_list'){await reply(route,{ok:true,kits:[kit]});return true;}
  if(name==='ps_firmware_list'){await reply(route,{ok:true,complete:true,total:1,installed:[],releases:[{id:kit.release_id,version:'0.3.27',status:'ready',model:stock.model,arch:stock.arch}]});return true;}
  if(name==='ps-firmware-admin'&&body?.action==='kit_download'&&body.id===kit.id){intercepted.push('kit_download');await reply(route,{ok:true,url:'data:application/octet-stream;base64,'+smallImage.toString('base64'),filename:kit.file_name,sha256:kit.sha256,bytes:kit.bytes,expires_in:300});return true;}
  if(name==='ps-firmware-admin'&&body?.action==='stock_file'&&body.id===qaId){intercepted.push('stock_file');stock.stock.file={file_id:'fixture',instance_id:'fixture',issued_at:when,expires_at:when,sha256:hash(file),bytes:Buffer.byteLength(file),consumed_by_device:false,superseded_at:null};stock.stock.state='file_issued';await reply(route,{ok:true,device_id:qaId,filename:'playerp-device.json',content:file,sha256:hash(file),bytes:Buffer.byteLength(file),expires_at:when});return true;}
  if(name==='ps_admin_stock_label'&&body?.p_device_id===qaId){intercepted.push('label_read_synthetic');await reply(route,{ok:true,label:{device_id:qaId,serial:d.serial,ssid:'PE600-SYNTHETIC',psk:'synthetic-wifi-only',local_address:'http://10.77.0.1',wifi_qr:'WIFI:T:WPA;S:PE600-SYNTHETIC;P:synthetic-wifi-only;;'}});return true;}
  if(name==='ps_admin_venue_search'){await reply(route,{ok:true,venues:[fixtureVenue]});return true;}
  if(name==='ps_admin_device_assign'&&body?.p_device_id===qaId&&body.p_venue_id===fixtureVenue.id){intercepted.push('assign');assigned=true;d.venue={id:fixtureVenue.id,name:fixtureVenue.name};Object.assign(d.link,{venue_id:fixtureVenue.id,venue_name:fixtureVenue.name,state:'asignado_pendiente_sync'});stock.venue_id=fixtureVenue.id;stock.stock.state='validated_assigned';await reply(route,{ok:true,device_id:qaId,venue_id:fixtureVenue.id,link:d.link});return true;}
  if(name==='ps-firmware-admin'&&body?.action==='delivery_email'&&body.id===qaId&&body.to==='qa@example.invalid'&&!body.send){intercepted.push('email_preview');await reply(route,{ok:true,mode:'preview',sent:false,sendable:false,held:true,held_reason:'synthetic_test_only',email:{to:body.to,subject:'PE600 synthetic delivery',text:'Enciende el equipo, conecta al SSID de la etiqueta y configura la red del local. Clave: SYNTHETIC-ONLY'}});return true;}
  return false;
 });
 await page.reload();await expect(page.getByTestId('ps-stock-download-image')).toBeVisible();
 const imageDownload=page.waitForEvent('download');await page.getByTestId('ps-stock-download-image').click();const image=await imageDownload;
 assert.equal(image.suggestedFilename(),kit.file_name);assert.equal(hash(await readFile(await image.path())),kit.sha256);
 await expect(page.getByTestId('ps-stock')).toContainText(kit.sha256);assert(intercepted.includes('kit_download'));
 record('Synthetic kit_download requests the selected kit; downloads a small file preserving name, SHA and bytes',{kitId:kit.id,filename:image.suggestedFilename(),sha256:kit.sha256,bytes:kit.bytes,realImageDownloaded:false});
 const fileDownload=page.waitForEvent('download');await page.getByTestId('ps-stock-download-file').click();const individual=await fileDownload;
 assert.equal(individual.suggestedFilename(),'playerp-device.json');assert.equal(await readFile(await individual.path(),'utf8'),file);
 await expect(page.getByTestId('ps-stock')).not.toContainText('pse_');record('Synthetic individual file emission downloads exact bytes without displaying enrollment code');
 // Synthetic device confirmations, never sent to the backend or physical device.
 stock.stock.state='validated_in_stock';stock.stock.label_ready=true;stock.stock.next_step='assign';d.link.prepared=true;d.link.state='en_stock';
 await page.reload();await page.getByTestId('ps-stock-get-label').click();await expect(page.getByTestId('ps-stock-label')).toContainText('PE600-SYNTHETIC');await expect(page.getByTestId('ps-stock-label')).not.toContainText('SYNTHETIC-ONLY');
 record('Synthetic label renders SSID and local address without maintenance key');
 await page.getByTestId('ps469-assign-venue').fill('PE600');await page.getByRole('option').filter({hasText:fixtureVenue.name}).click();await page.getByTestId('ps469-assign').click();
 await expect.poll(()=>assigned).toBe(true);await expect(page.getByTestId('ps-stock-email')).toBeVisible();record('Assignment action uses synthetic reply for the selected venue');
 await page.getByTestId('ps-stock-email').locator('input[type=email]').fill('qa@example.invalid');await page.getByTestId('ps-stock-preview-email').click();await expect(page.getByTestId('ps-stock-email-preview')).toContainText('PE600 synthetic delivery');await expect(page.getByTestId('ps-stock-email-preview')).not.toContainText('pse_');
 record('Synthetic delivery email preview; no send request or email');
 for(const id of ['ps469-overview','ps-stock-preparation','ps469-wifi','ps469-firmware']){const target=page.locator('#'+id);await expect(target).toHaveCount(1);await page.evaluate(id=>{location.hash=id;},id);await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('#'+id);}
 record('Legacy anchors resolve on the QA sheet');
 assertGuard(report);assert.deepEqual(report.errors,[]);report.realReads=realReads;report.synthetic=intercepted;report.pass=true;record('Mutation guardian: 0 real mutations, 0 unexpected requests',{mutations:0});
}catch(e){report.failure=e.stack;throw e;}finally{await ctx?.close();await browser.close();await writeFile(out+'/ui-regression.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass??false,mutations:report.mutations,blocked:report.blocked,failure:report.failure}));}
