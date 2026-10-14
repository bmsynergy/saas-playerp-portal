// Local anonymous navigation only. This does not certify PROD hosting or a real consent.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const routes = [...readFileSync('src/App.tsx','utf8').matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]);
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const page = await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
// No login, writes or real consent requests in this local navigation check.
await context.route('https://*.supabase.co/**',r=>r.abort());
const rows=[];
try {
 for (const template of routes) {
  const route=template.replace(/:(?:venueId|id)/g,'801f04ef-c2b8-4106-8252-73689a6fe76d').replace('*','/not-a-route');
  const expected = route==='/'||route.startsWith('/admin') ? '/auth/login' : null;
  for(const action of ['direct','reload']) {
   await page.goto(`http://127.0.0.1:18791${route}`);
   if(action==='reload')await page.reload();
   await page.waitForTimeout(100);
   if(expected)await page.waitForURL(u=>u.pathname===expected);
   assert((await page.locator('body').innerText()).trim().length>0);
   rows.push({route:template,action,finalPath:new URL(page.url()).pathname,status:'passed'});
  }
 }
 const request='11111111-1111-4111-8111-111111111111'; // syntactic id only, never sent to backend
 await page.goto(`http://127.0.0.1:18791/oauth/consent?request_id=${request}`);
 await page.waitForURL(u=>u.pathname==='/auth/login');
 assert.equal(new URL(page.url()).searchParams.get('next'),`/oauth/consent?request_id=${request}`);
 assert.deepEqual(errors,[]);
 writeFileSync('../evidence/routes-local.json',JSON.stringify({scope:'local anonymous navigation, no real consent or PROD validation',rows,syntacticConsentLoginReturn:true,pageErrors:errors},null,2));
 console.log(`${rows.length} direct/reload checks passed; syntactic request retained for login; no real consent tested`);
} finally {await browser.close();}
