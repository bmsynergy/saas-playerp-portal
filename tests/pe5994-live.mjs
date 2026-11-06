// PE-599.4: published portal, real DEV APIs, a NEW simulated apparatus only.
// Admin operations are UI clicks. Only device enroll/ack/status are simulated.
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const origin='https://playerp.dev.bmore.app',api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const key=(await readFile('build/dev-defaults.ts','utf8')).match(/SUPABASE_PUBLIC_KEY = "([^"]+)/)[1];
const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
const out='docs/evidence/pe5994';await mkdir(out,{recursive:true});
const report={origin,started:new Date().toISOString(),kind:'Published portal + real DEV backend; SIMULATED new apparatus, no hardware',checks:[],errors:[]};
async function login(account){const r=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});assert.equal(r.status,200);return r.json();}
const session=await login(accounts.staff_activo);
async function rpc(name,body,token=session.access_token){const r=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function device(path,body,credential){const r=await fetch(api+'/functions/v1/print-server/v1/'+path,{method:body?'POST':'GET',headers:{...(credential?{Authorization:'Bearer '+credential}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,200,'device '+path+' HTTP');assert.equal(data.ok,true,'device '+path);return data;}
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},session);
const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
// Only print dialog itself is stubbed, to inspect the exact printable document safely.
await ctx.addInitScript(()=>{window.print=()=>{};});
let file,credential,psId;
const record=(name,details={})=>{report.checks.push({name,...details});console.log('PASS',name);};
try{
 await page.goto(origin+'/admin/print-servers/inventory?create=1');const dialog=page.getByTestId('admin-device-add-dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Revisar',exact:true})).toBeEnabled();
 await dialog.getByRole('textbox').first().fill('PE5994 SIM portal '+new Date().toISOString().slice(0,16));
 await dialog.getByRole('button',{name:'Revisar',exact:true}).click();
 const createdPromise=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_admin_device_create'));
 await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();const created=await(await createdPromise).json();assert.equal(created.ok,true);
 report.deviceId=created.device.id;report.serial=created.device.serial;assert.notEqual(report.deviceId,'59a41440-8536-4045-aed1-3fcc5adaf193');
 await expect(page.getByTestId('ps-stock-state')).toContainText('Pendiente');record('UI create and reserve; no venue',{deviceId:report.deviceId,serial:report.serial});
 await expect(page.getByTestId('ps-stock-get-label')).toHaveCount(0);await expect(page.getByTestId('ps-preparation')).toHaveCount(0);
 const downloadPromise=page.waitForEvent('download');await page.getByTestId('ps-stock-download-file').click();const dl=await downloadPromise;
 const content=await readFile(await dl.path());file=JSON.parse(content);assert.equal(dl.suggestedFilename(),'playerp-device.json');assert.equal(file.device.inventory_id,report.deviceId);assert.equal(file.profile,'dev');assert.equal(file.workshop_network.mode,'ethernet_dhcp');
 const state1=(await rpc('ps_admin_stock_status',{p_device_id:report.deviceId})).data;assert.equal(state1.stock.state,'file_issued');assert.equal(createHash('sha256').update(content).digest('hex'),state1.stock.file.sha256);
 await expect(page.getByTestId('ps-stock-download-file')).toBeDisabled();assert(!(await page.locator('body').innerText()).includes(file.enrollment.code));
 const preLabel=await rpc('ps_admin_stock_label',{p_device_id:report.deviceId});assert.equal(preLabel.data.ok,false);await page.getByTestId('ps-stock').screenshot({path:out+'/published-pending.png'});
 record('UI individual download matches server SHA; no human validation; label denied',{sha256:state1.stock.file.sha256,state:state1.stock.state});
 const en=await device('enroll',{enrollment_code:file.enrollment.code,device_id:'pe5994-sim-'+randomUUID(),hostname:file.device.hostname,software_version:'0.3.27',enroll_ack:1});
 credential=en.credential;psId=en.print_server_id;assert.equal(en.venue_id,null);assert.equal(en.wifi.psk,file.setup_wifi.psk);assert.equal(en.wifi.admin_code,file.maintenance.admin_code);
 const pending=(await rpc('ps_admin_stock_status',{p_device_id:report.deviceId})).data;assert.equal(pending.stock.label_ready,false);
 const proof=(part,a,b)=>createHmac('sha256',credential).update(`playerp-ps-enroll-ack/1\n${psId.toLowerCase()}\n${part}\n${part==='wifi'?`${a}\n${b}`:a}`).digest('hex');
 await device('enroll/ack',{print_server_id:psId,parts:{wifi:{status:'done',proof:proof('wifi',file.setup_wifi.ssid,file.setup_wifi.psk)},admin_code:{status:'done',proof:proof('admin_code',file.maintenance.admin_code)}}},credential);
 await device('status',{software_version:'0.3.27',hostname:file.device.hostname,setup_url:'http://10.77.0.1',local_address:'192.168.50.24',local_port:443,uptime_seconds:95,queue_depth:0},credential);
 await page.reload();await expect(page.getByTestId('ps-stock-state')).toContainText('stock');
 const validated=(await rpc('ps_admin_stock_status',{p_device_id:report.deviceId})).data;assert.equal(validated.stock.state,'validated_in_stock');assert.equal(validated.venue_id,null);assert.equal(validated.stock.credential.permanent,true);
 await page.getByTestId('ps-stock-get-label').click();await expect(page.getByTestId('ps-stock-label')).toContainText(file.setup_wifi.ssid);await expect(page.getByTestId('ps-stock-label')).toContainText('http://10.77.0.1');await expect(page.getByTestId('ps-stock-label')).not.toContainText(file.maintenance.admin_code);
 // Mask Wi-Fi only in screenshot, not in rendering or assertions.
 await page.getByTestId('ps-stock').screenshot({path:out+'/published-stock.png',mask:[page.getByTestId('ps-stock-label')]});
 const labelRefresh=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_admin_stock_label'));await page.getByTestId('ps-stock-print-label').click();assert.equal((await(await labelRefresh).json()).ok,true);
 record('Authenticated simulated device confirms; UI validated stock without venue; label revalidated on print',{state:validated.stock.state,permanent:true,maintenanceOnLabel:false});
 await page.getByTestId('ps469-assign-venue').fill('QA-120 Sede 001');await page.getByRole('option').filter({hasText:'QA-120 Sede 001'}).click();
 const assignedPromise=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_admin_device_assign'));await page.getByTestId('ps469-assign').click();const assigned=await(await assignedPromise).json();assert.equal(assigned.ok,true);
 const config=await device('config',null,credential);await device('status',{software_version:'0.3.27',hostname:file.device.hostname,setup_url:'http://10.77.0.1',link_ack:config.link},credential);
 await page.reload();await expect(page.getByTestId('ps-stock-state')).toContainText('Asignado');record('UI assignment to QA venue, simulated link_ack',{venue:config.venue_id});
 const email=page.getByTestId('ps-stock-email');await email.locator('input[type=email]').fill('delivered+pe5994-portal@resend.dev');
 await page.getByTestId('ps-stock-preview-email').click();const preview=page.getByTestId('ps-stock-email-preview');await expect(preview).toBeVisible();assert((await preview.innerText()).includes(file.maintenance.admin_code));assert(!(await preview.innerText()).includes('pse_'));
 await expect(page.getByTestId('ps-stock-send-email')).toBeDisabled();await preview.locator('input').fill(report.serial);
 const sentPromise=page.waitForResponse(r=>r.url().endsWith('/functions/v1/ps-firmware-admin')&&r.request().postDataJSON()?.send===true);await page.getByTestId('ps-stock-send-email').click();const sent=await(await sentPromise).json();assert.equal(sent.sent,true);record('UI explicit email preview + serial confirmation + send only to authorized sink',{to:'delivered+pe5994-portal@resend.dev',sent:true});
 // A non-authorized example address is previewed only. Never request sending to it.
 await email.locator('input[type=email]').fill('nobody@example.invalid');await page.getByTestId('ps-stock-preview-email').click();await expect(preview).toContainText('retenido');await expect(page.getByTestId('ps-stock-send-email')).toHaveCount(0);record('Unauthorized recipient preview held; no send available');
 await page.getByTestId('ps-stock').screenshot({path:out+'/published-assigned.png',mask:[preview]});
 const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert(!storage.includes(file.enrollment.code)&&!storage.includes(file.maintenance.admin_code)&&!storage.includes(file.setup_wifi.psk));record('No device secrets in browser persistent storage');
 report.url=page.url();report.imageAvailable=await page.getByTestId('ps-stock-download-image').count()>0;
 record('Image availability comes from compatible DEV catalogue',{available:report.imageAvailable});
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.pass=false;report.failure=String(e.message).replace(/pse_[a-zA-Z0-9]+|pst_[a-zA-Z0-9]+/g,'[redacted]');throw e;}
finally{await writeFile(out+'/live.json',JSON.stringify(report,null,2));await browser.close();await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token}});console.log(JSON.stringify({...report,errors:report.errors.length}));}
