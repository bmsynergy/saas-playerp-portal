import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799','https://playerp.dev.bmore.app'].includes(origin));
const session=JSON.parse(await readFile('../tmp/private/session.json','utf8'));
const out='docs/evidence/pe5994';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
const report={origin,device:'87767ba2-7f02-4edb-9684-0cb0c6bee7dc',kind:'Real DEV backend, piece 1 simulated device; read-only UI',views:[],errors:[]};
try{for(const width of [390,1440]){
 const ctx=await browser.newContext({viewport:{width,height:1000}});await ctx.addInitScript(s=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale','es');},session);
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/admin/print-servers/devices/'+report.device);await expect(page.getByTestId('ps-stock-state')).toContainText('Asignado',{timeout:30000});
 await expect(page.getByTestId('ps-preparation')).toHaveCount(0);
 await expect(page.getByTestId('ps-stock')).not.toContainText('pse_');
 await page.getByTestId('ps-stock').screenshot({path:`${out}/read-${width}.png`});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
 report.views.push({width,state:await page.getByTestId('ps-stock-state').innerText(),path:new URL(page.url()).pathname});await ctx.close();
}assert.deepEqual(report.errors,[]);report.pass=true;}finally{await browser.close();await writeFile(`${out}/read.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
