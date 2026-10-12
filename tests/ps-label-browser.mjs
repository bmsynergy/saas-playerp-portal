// PE-411: synthetic local fixtures, all external requests intercepted. No live authorization claim.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {PNG} from 'pngjs';
import QRCode from 'qrcode';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:18799',out='docs/evidence/ps-credential-ux';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',venueId='22222222-2222-4222-8222-222222222222';
const user={id:uid,email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const exp=Math.floor(Date.now()/1000)+3600,enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:uid,exp,iat:exp-3600,aud:'authenticated',role:'authenticated',session_id:uid})}.synthetic`,refresh_token:'synthetic',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const device={id:'fixture-device',serial:'PS-XXXXXXXX',hostname:'playerp-ps-xxxxxxxx',model:'rpi4-2gb',status:'assigned',legacy:false};
const wifi={ssid:'W'.repeat(28)+';:"\\',psk:'0123456789',admin_code:'ABCD234567',wifi_applied_at:'2026-01-01T00:00:00Z',admin_code_applied_at:'2026-01-01T00:00:00Z'};
const venue={id:venueId,name:'Synthetic venue · PE-411',slug:'synthetic',is_active:true};
const ps={id:'fixture-ps',label:'Synthetic Print Server',hostname:device.hostname,device_id:device.id,status:'active',software_version:'0.3.15',online:true,last_seen_at:'2026-01-01T00:00:00Z'};
const fleet=[{venue_id:venueId,venue_name:venue.name,venue_slug:venue.slug,venue_is_active:true,print_server:ps,pending_enrollment:null,printers_total:0,printers_active:0,printers_paused:0,printers_with_error:0,pending_jobs:0}];
const checks=[],errors=[];
async function setup(width,lang='en'){
 const ctx=await browser.newContext({viewport:{width,height:960},locale:lang==='es'?'es-ES':'en-US',permissions:['clipboard-read','clipboard-write']});
 await ctx.addInitScript(({session,lang})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(session));localStorage.setItem('playerp.locale',lang);},{session,lang});
 const state={sheet:{ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device:{...device},wifi:{...wifi},rotations:[],cert:{},cert_operations:[],can_manage:true,is_platform_admin:true},reads:0,created:false,assigned:false};
 await ctx.route(url=>!url.href.startsWith(origin),async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='fzwzmwstxlsxdzdmphyq.supabase.co')return route.abort();
  const name=url.pathname.split('/').pop(),send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.startsWith('/auth/v1/'))return send(url.pathname.endsWith('/user')?user:session);
  const args=route.request().postDataJSON()??{};
  if(name==='staff_profiles')return send(null);
  if(name==='is_platform_staff')return send(true);
  if(name==='portal_access')return send({is_platform_staff:true,platform_role:'super_admin',owner_venues:[]});
  if(name==='portal_tenant_directory')return send([venue]);
  if(name==='portal_ps_fleet')return send(fleet);
  if(name==='portal_ps_devices')return send({devices:[{...device,venue_id:venueId,venue_name:venue.name,print_server_id:ps.id,created_at:wifi.wifi_applied_at},...(state.created?[{...device,id:'fixture-new',serial:'PS-YYYYYYYY',status:'stock',venue_id:null,created_at:wifi.wifi_applied_at}]:[])]});
  if(name==='ps_admin_device_create'){state.created=true;return send({ok:true,device:{...device,id:'fixture-new',serial:'PS-YYYYYYYY',status:'stock'}});}
  if(name==='ps_admin_device_assign'){assert.equal(args.p_device_id,'fixture-new');assert.equal(args.p_venue_id,venueId);state.assigned=true;return send({ok:true,enrollment_code:'pse_SYNTHETIC_ONE_USE_ONLY',expires_at:'2026-12-01T00:00:00Z'});}
  if(name==='ps_panel_state')return send({venue_id:venueId,can_manage:true,print_server:ps,printers:[],pending_enrollment:null,last_scan:null});
  if(name==='ps_panel_device'){state.reads++;return send(state.sheet);}
  if(name==='ps_panel_ota')return send({ok:true,print_servers:[]});
  if(name==='portal_tenant_detail')return send({venue,print_servers:[]});
  if(name==='portal_owner_venues')return send([]);
  return send(null);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/admin/print-servers/${venueId}?lang=${lang}`);await expect(page.getByTestId('dev-serial')).toHaveText(device.serial);
 return {ctx,page,state};
}
try{
 for(const width of [390,1440]){
  const {ctx,page,state}=await setup(width),panel=page.getByTestId('ps-device-panel');
  state.sheet.rotations=[{command_id:'fixture-pending',kind:'wifi',status:'pending'}];await page.reload();await expect(page.getByTestId('dev-label-pending')).toBeVisible();
  await expect(page.getByTestId('dev-psk')).not.toContainText(wifi.psk);
  await page.getByTestId('dev-ssid').getByRole('button').first().click();await page.getByTestId('dev-psk').getByRole('button').first().click();
  await expect(page.getByTestId('dev-ssid')).toContainText(wifi.ssid);await expect(page.getByTestId('dev-psk')).toContainText(wifi.psk);
  await page.getByTestId('dev-admin-code').getByRole('button').last().click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),wifi.admin_code);
  await expect(page.getByTestId('dev-admin-code')).not.toContainText(wifi.admin_code);
  const before=state.reads;await page.getByTestId('dev-label-preview-action').click();await expect(page.getByTestId('dev-label-preview-image')).toBeVisible();assert.ok(state.reads>before);
  await panel.screenshot({path:`${out}/sheet-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const pending=page.waitForEvent('download');await page.getByTestId('dev-label-download').click();const download=await pending;assert.equal(download.suggestedFilename(),'PS-XXXXXXXX-50x30mm.png');if(width===1440)await download.saveAs(`${out}/PS-XXXXXXXX-50x30mm.png`);
  state.sheet.wifi={...wifi,psk:'9876543210',wifi_applied_at:'2026-01-02T00:00:00Z'};
  let leaked=false;const capture=()=>leaked=true;page.on('download',capture);await page.getByTestId('dev-label-download').click();
  await expect(page.getByTestId('dev-label')).toContainText('Reprint');await expect(page.getByTestId('dev-label-preview-image')).toHaveCount(0);assert.equal(leaked,false);page.off('download',capture);
  await expect(page.getByTestId('dev-psk')).toHaveText('••••••••••');await expect(page.getByTestId('dev-qr')).toHaveCount(0);
  state.sheet.can_read_credentials=false;state.sheet.can_manage_credentials=false;state.sheet.wifi=null;
  await page.getByTestId('dev-label-preview-action').click();await expect(panel).toContainText('available only to the venue owner');await expect(page.getByTestId('dev-label')).toHaveCount(0);await expect(panel).not.toContainText('9876543210');
  checks.push(`synthetic ${width}px: hidden/copy/preview/download; fresh-read change blocks old export; access loss clears; no overflow`);await ctx.close();
 }
 const {ctx,page,state}=await setup(390,'es');state.sheet.wifi=null;state.sheet.device={...device,legacy:true,hostname:'playerp-print-001'};
 await page.reload();await expect(page.getByTestId('dev-label-disabled')).toBeVisible();await page.locator('#ps-recovery-help summary').click();await expect(page.locator('#ps-recovery-help')).toContainText('P13');await page.getByTestId('ps-device-panel').screenshot({path:`${out}/legacy-absent-es-390.png`});
 await page.goto(`${origin}/admin/print-servers/inventory?lang=es`);await page.getByTestId('inv-create').click();await expect(page.getByTestId('inv-row-PS-YYYYYYYY')).toBeVisible();await page.getByTestId('inv-venue-PS-YYYYYYYY').selectOption(venueId);await page.getByTestId('inv-assign-PS-YYYYYYYY').click();await expect(page.getByTestId('inv-code-value')).toHaveText('pse_SYNTHETIC_ONE_USE_ONLY');assert.ok(state.created&&state.assigned);await expect(page.getByTestId('inv-code')).not.toContainText(wifi.admin_code);
 checks.push('synthetic create/assign preserves serial, activation separate; legacy absent blocks label and explains P13');
 const raster=await page.evaluate(async({device,wifi})=>{
  const m=await import('/src/lib/psLabel.ts'),texts=[],original=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){texts.push(text);return original.call(this,text,...args);};
  let blob;try{blob=await m.generateLabelPng({deviceId:device.id,serial:device.serial,ssid:wifi.ssid,password:wifi.psk,appliedAt:wifi.wifi_applied_at});}finally{CanvasRenderingContext2D.prototype.fillText=original;}
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const c=canvas.getContext('2d');c.drawImage(bitmap,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;
  let monochrome=true,minX=canvas.width,minY=canvas.height,maxX=0,maxY=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4,v=pixels[i];if(![0,255].includes(v)||pixels[i+1]!==v||pixels[i+2]!==v||pixels[i+3]!==255)monochrome=false;if(v===0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  const printCalls=[],append=Node.prototype.appendChild;Node.prototype.appendChild=function(node){const result=append.call(this,node);if(node instanceof HTMLIFrameElement)node.contentWindow.print=()=>printCalls.push(node.contentDocument.head.textContent);return result;};
  try{await m.printLabel(blob);}finally{Node.prototype.appendChild=append;}
  const result={width:bitmap.width,height:bitmap.height,monochrome,bounds:{minX,minY,maxX,maxY},texts,printCalls,base64:await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);})};document.querySelectorAll('iframe').forEach(f=>f.contentWindow.dispatchEvent(new Event('afterprint')));return result;
 },{device,wifi});
 assert.equal(raster.width,590);assert.equal(raster.height,354);assert.ok(raster.monochrome);assert.ok(raster.bounds.minX>=18&&raster.bounds.minY>=18&&raster.bounds.maxX<=571&&raster.bounds.maxY<=335);
 assert.ok(raster.texts.includes(device.serial)&&raster.texts.includes(wifi.ssid)&&raster.texts.includes(`Password: ${wifi.psk}`));assert.ok(raster.texts.includes('3 Open http://10.77.0.1'));assert.ok(!raster.texts.some(s=>s.includes(wifi.admin_code)));assert.equal(raster.printCalls.length,1);assert.match(raster.printCalls[0],/size:50mm 30mm;margin:0/);
 const bytes=Buffer.from(raster.base64,'base64');
 const decoded=PNG.sync.read(bytes),payload='WIFI:T:WPA;S:'+wifi.ssid.replace(/([\\;,:"])/g,'\\$1')+';P:'+wifi.psk+';;';
 assert.equal(jsQR(new Uint8ClampedArray(decoded.data),decoded.width,decoded.height)?.data,payload);
 const qr=QRCode.create(payload,{errorCorrectionLevel:'M'}),quiet=4,area=166,scale=Math.floor(area/(qr.modules.size+8)),size=(qr.modules.size+8)*scale;
 assert.ok(scale>=3);const x0=590-18-area+Math.floor((area-size)/2),y0=170+Math.floor((area-size)/2);
 for(let row=0;row<qr.modules.size+8;row++)for(let col=0;col<qr.modules.size+8;col++){
  const black=row>=quiet&&col>=quiet&&row<qr.modules.size+quiet&&col<qr.modules.size+quiet&&qr.modules.get(row-quiet,col-quiet);
  for(let y=0;y<scale;y++)for(let x=0;x<scale;x++)assert.equal(decoded.data[((y0+row*scale+y)*590+x0+col*scale+x)*4],black?0:255);
 }
 assert.deepEqual(raster.texts.slice(-4),['1 Power off/on','2 Connect to Wi-Fi above','within 90 s','3 Open http://10.77.0.1']);
 assert.ok(!payload.includes(wifi.admin_code)&&!payload.includes('token'));
 checks.push('Final PNG decoded exactly to applied WPA payload; all QR modules square integer pixels, quiet zone 4, ECC M, scale '+scale+' px/module; no admin/token');
 let offset=8,phys=[];while(offset<bytes.length){const len=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);if(type==='pHYs')phys.push([bytes.readUInt32BE(offset+8),bytes.readUInt32BE(offset+12),bytes[offset+16]]);offset+=len+12;}assert.deepEqual(phys,[[11811,11811,1]]);
 const fixtures=await page.evaluate(async({device,wifi})=>{
  const {projectDeviceSheet}=await import('/src/lib/psDevice.ts'),{labelDataFromSheet,generateLabelPng}=await import('/src/lib/psLabel.ts');
  const base={ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,device,wifi,rotations:[]};
  const list=[['applied',base],['pending',{...base,rotations:[{command_id:'pending-fixture',kind:'wifi',status:'pending'}],wifi:{...wifi,pending_wifi_psk:'9876543210',pending_ssid:'NOT_APPLIED'},technical_token:'TECHNICAL_SENTINEL'}],['absent',{...base,wifi:{...wifi,wifi_applied_at:null}}],['maximum-escaped',{...base,wifi:{...wifi,ssid:'\\'.repeat(32)}}]];
  const result=[];for(const [name,raw] of list){const label=labelDataFromSheet(projectDeviceSheet(raw));if(!label){result.push({name,available:false});continue;}
   const blob=await generateLabelPng(label);result.push({name,available:true,ssid:label.ssid,password:label.password,base64:await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);})});
  }return result;
 },{device,wifi});
 for(const fixture of fixtures){
  if(fixture.name==='absent'){assert.equal(fixture.available,false);continue;}
  const png=PNG.sync.read(Buffer.from(fixture.base64,'base64')),scan=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
  const expected='WIFI:T:WPA;S:'+fixture.ssid.replace(/([\\;,:"])/g,'\\$1')+';P:'+fixture.password+';;';
  assert.equal(scan?.data,expected);assert.ok(!scan.data.includes(wifi.admin_code)&&!scan.data.includes('TECHNICAL_SENTINEL')&&!scan.data.includes('NOT_APPLIED'));
  if(fixture.name==='pending')assert.equal(fixture.password,wifi.psk);
 }
 checks.push('Export fixtures applied/pending/absent/32 escaped characters: final PNG decoded exactly to applied values; pending keeps prior credentials; absent produces no label');
 await mkdir('public/examples',{recursive:true});await writeFile('public/examples/PS-XXXXXXXX-50x30mm.png',bytes);await writeFile(`${out}/composition.json`,JSON.stringify({...raster,base64:undefined},null,2));
 await page.setContent(`<style>@page{size:50mm 30mm;margin:0}body{margin:0}img{display:block;width:50mm;height:30mm}</style><img src="data:image/png;base64,${raster.base64}">`);
 const physical=await page.locator('img').boundingBox();assert.ok(Math.abs(physical.width-50/25.4*96)<0.1&&Math.abs(physical.height-30/25.4*96)<0.1);
 await page.pdf({path:`${out}/synthetic-physical-50x30.pdf`,width:'50mm',height:'30mm',printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true});
 checks.push('single raster: 590×354, pHYs 11811/11811 metre, black/white, >=18px margins, full max SSID/serial, 3 steps in two columns, mandatory Wi-Fi QR, no admin/token; print CSS 50×30mm');await ctx.close();assert.deepEqual(errors,[]);
 await writeFile(`${out}/checks.json`,JSON.stringify({kind:'Synthetic local fixtures; NOT server authorization or published DEV evidence',checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
