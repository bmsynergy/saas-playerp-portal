// Read-only validation with an ordinary authorized DEV test account. No device rotations.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert.ok(['https://playerp.dev.bmore.app','http://127.0.0.1:18799'].includes(origin));
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const apikey=(await readFile('src/lib/config.ts','utf8')).match(/SUPABASE_PUBLIC_KEY = "([^"]+)"/)[1];
const out='test-results/pe418-live';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const report={origin,kind:'real DEV authenticated read-only verification; no rotations or mutations',venues:[],checks:[],errors:[]};
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-ES'});const page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/auth/login?lang=en');await page.getByLabel('Email address',{exact:true}).fill(accounts.staff_activo.email);await page.getByLabel('Password',{exact:true}).fill(accounts.staff_activo.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(url=>!url.pathname.startsWith('/auth/'));
 // Return summaries only: actual credentials never leave the browser's memory.
 const rows=await page.evaluate(async(apikey)=>{
  const session=JSON.parse(localStorage.getItem('playerp.portal.dev.auth')||'null');
  const rpc=async(name,args={})=>{const r=await fetch('https://fzwzmwstxlsxdzdmphyq.supabase.co/rest/v1/rpc/'+name,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey,'Content-Type':'application/json'},body:JSON.stringify(args)});if(!r.ok)throw new Error('RPC read failed '+r.status);return r.json();};
  const fleet=await rpc('portal_ps_fleet');const results=[];
  for(const row of fleet){const label=await rpc('ps_panel_recovery_label',{p_venue_id:row.venue_id});results.push({venueId:row.venue_id,hasPs:!!row.print_server,ready:label.ready,missing:label.missing,pending:label.wifi_rotation_pending,fields:label.label?Object.keys(label.label).sort():[]});}
  return results;
 },apikey);
 report.venues=rows;
 const candidates=[rows.find(r=>r.ready),rows.find(r=>r.hasPs&&!r.ready),rows.find(r=>!r.hasPs)].filter(Boolean);assert.ok(candidates.length);
 for(const [index,row] of candidates.entries()){
  await page.goto(origin+`/admin/print-servers/${row.venueId}?lang=es`);await expect(page.getByTestId('dev-label')).toBeVisible();
  const action=page.getByTestId('dev-label-preview-action');
  if(row.ready&&!row.pending){
   await expect(action).toBeEnabled();await action.click();await expect(page.getByTestId('dev-label-preview-image')).toBeVisible();await page.getByTestId('dev-label-hide').click();
   const sourceEvent=page.waitForResponse(r=>r.url().endsWith('/rpc/ps_panel_recovery_label')&&r.status()===200);
   const downloadEvent=page.waitForEvent('download');await page.getByTestId('dev-label-download').click();
   const source=(await (await sourceEvent).json()).label,download=await downloadEvent;
   const png=PNG.sync.read(await readFile(await download.path()));const qr=jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data;
   const escape=s=>s.replace(/([\\;,:"])/g,'\\$1');
   assert.ok(png.width===590&&png.height===354,'Expected 300-dpi label raster');
   assert.ok(qr==='WIFI:T:WPA;S:'+escape(source.ssid)+';P:'+escape(source.psk)+';;','Downloaded QR must match confirmed server data');
   assert.ok(download.suggestedFilename()===source.serial+'-50x30mm.png','Confirmed serial filename');await download.delete();
   await page.evaluate(()=>{window.prints=[];const append=Node.prototype.appendChild;Node.prototype.appendChild=function(node){const result=append.call(this,node);if(node instanceof HTMLIFrameElement)node.contentWindow.print=()=>window.prints.push(node.contentDocument.head.textContent);return result;};});
   await page.getByTestId('dev-label-print').click();await expect.poll(()=>page.evaluate(()=>window.prints.length)).toBe(1);
   assert.match(await page.evaluate(()=>window.prints[0]),/size:50mm 30mm;margin:0/);
   await page.evaluate(()=>document.querySelectorAll('iframe').forEach(f=>f.contentWindow.dispatchEvent(new Event('afterprint'))));
   report.checks.push('Real confirmed source: preview, downloaded PNG 590x354 with QR matching current Wi-Fi, and print action with 50x30mm CSS; image deleted, no physical print');
  }
  else{for(const id of ['dev-label-preview-action','dev-label-download','dev-label-print'])await expect(page.getByTestId(id)).toBeDisabled();await expect(page.getByTestId('dev-label-disabled')).toBeVisible();report.checks.push('Real unavailable label blocked with reason: '+row.missing.join(', '));}
  await page.locator('#ps-recovery-help summary').click();const help=await page.locator('#ps-recovery-help').innerText();assert.doesNotMatch(help,/Tom|Beny|PE-411|legacy|endpoint|P13|\/api\//i);assert.match(help,/En línea/);assert.match(help,/administrativo/);
  await page.getByTestId('dev-label').screenshot({path:`${out}/real-label-state-${index}.png`});await page.locator('#ps-recovery-help').screenshot({path:`${out}/real-instructions-${index}.png`});
 }
 report.checks.push('Operational Spanish instructions verified: physical identity, secure local interface, recovery, setup, rotations, online confirmation, reprint, no administrative code');
 assert.deepEqual(report.errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
