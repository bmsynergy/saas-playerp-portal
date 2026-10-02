// Usuarios del venue para su owner — pasada EN VIVO contra el portal (DEV), a 390 px de ancho.
// Entra como owner de prueba en "/", comprueba que la sección Usuarios lista exactamente los
// miembros de ese venue (los que devuelve la edge), que nada desborda a lo ancho (página y
// diálogos) y, con un miembro de prueba, que al aprobarle el acceso al portal entra en "/" y ve
// la ficha del venue SIN la sección Usuarios, y que al quitárselo deja de entrar.
// Solo escribe el acceso al portal de la cuenta de prueba (lo aprueba y lo quita).
// Uso: OVU_ACCOUNTS=…/cuentas.json OVU_ANON=… node tests/owner-users-live.mjs
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const anon=process.env.OVU_ANON,accounts=JSON.parse(await readFile(process.env.OVU_ACCOUNTS,'utf8'));
const owner=accounts.owner_uno,member=accounts.venue_frontdesk;
const A=process.env.OVU_VENUE_A??'c1700000-0000-0000-0000-0000000000a0';
const out=(process.env.SMOKE_OUTPUT_DIR??new URL('../test-results/live/',import.meta.url).pathname).replace(/\/?$/, '/');await mkdir(out,{recursive:true});
const ok=name=>console.log('PASS '+name);
const post=async(url,body,headers={})=>{const r=await fetch(url,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};};
const login=await post(api+'/auth/v1/token?grant_type=password',{email:owner.email,password:owner.password});assert.equal(login.status,200,'owner login');
const edge=body=>post(api+'/functions/v1/owner-venue-users',{...body,venue_id:A},{Authorization:'Bearer '+login.data.access_token});
const portal=async value=>{const r=await edge({action:'set_portal_access',user_id:member.user_id,portal_access:value});assert.equal(r.status,200,'set_portal_access');};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const signIn=async(page,account,path)=>{
 await page.goto(origin+path);
 await page.getByLabel('Email address',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
};
const fits=async(page,what)=>{const m=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,win:window.innerWidth}));
 assert(m.doc<=m.win&&m.body<=m.win,`${what}: horizontal overflow ${JSON.stringify(m)}`);return m;};
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'en'}),page=await ctx.newPage();page.setDefaultTimeout(20000);
 await signIn(page,owner,`/?venue=${A}`);
 await page.getByTestId('owner-users').waitFor();await page.getByTestId('owner-user-row').first().waitFor();
 const expected=(await edge({action:'list'})).data;
 const rows=(await page.getByTestId('owner-user-row').allInnerTexts()).map(t=>t.replace(/\s+/g,' '));
 assert.equal(rows.length,expected.users.length,'row count');
 for(const u of expected.users)assert(rows.some(r=>r.includes(u.email)),`${u.email} listed`);
 assert.equal(Number(await page.getByTestId('owner-users-count').innerText()),expected.users.length);
 console.log(`  venue «${expected.venue.name}»: ${expected.users.map(u=>`${u.email}=${u.role}${u.portal_access?'+portal':''}`).join(', ')}`);
 ok(`Users section of the owner's venue lists exactly its ${rows.length} members with their role`);
 const m=await fits(page,'owner page');ok(`No horizontal scroll at ${m.win}px (document ${m.doc}px)`);
 await page.screenshot({path:`${out}owner-users-390.png`,fullPage:true});
 await page.getByTestId('owner-users').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}owner-users-390-viewport.png`});
 await page.getByTestId('owner-users-invite').click();await page.getByTestId('owner-invite-dialog').waitFor();
 await fits(page,'invite dialog');await page.screenshot({path:`${out}owner-users-390-invite.png`});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByTestId('owner-user-portal-toggle').first().click();await page.getByTestId('owner-user-confirm').waitFor();
 await fits(page,'confirm dialog');await page.screenshot({path:`${out}owner-users-390-confirm.png`});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 ok('Invite and confirmation dialogs fit at 390px (opened and cancelled, nothing sent)');

 // Approved member: enters "/", sees the venue card, no Users section; removed: no entry.
 await portal(true);
 const mctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'en'}),mpage=await mctx.newPage();mpage.setDefaultTimeout(20000);
 await signIn(mpage,member,'/');
 await mpage.locator('#owner-venue-title').waitFor();
 assert.equal(await mpage.locator('#owner-venue-title').innerText(),expected.venue.name);
 await mpage.waitForTimeout(1500);
 assert.equal(await mpage.getByTestId('owner-users').count(),0,'approved member must not see Users');
 await fits(mpage,'member page');await mpage.screenshot({path:`${out}member-approved-390.png`,fullPage:true});
 ok(`Approved member signs in at / and sees «${expected.venue.name}» without the Users section`);
 await portal(false);
 await mpage.goto(origin+'/');
 await mpage.getByText('Access denied',{exact:true}).first().waitFor();
 assert.equal(await mpage.locator('#owner-venue-title').count(),0,'removed member must not see the venue');
 await mpage.screenshot({path:`${out}member-removed-390.png`,fullPage:true});
 ok('After the owner removes portal access the same member no longer gets in');
 console.log('ALL PASS');
}finally{await portal(false).catch(()=>{});await browser.close();}
