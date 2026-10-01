// Presentation and preserved navigation checks. Existing DEV test identities only;
// no business writes, staff operations, password changes, invitations or email.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN??'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app','http://127.0.0.1:18799'].includes(origin));
assert(process.env.PORTAL_DEV_FIXTURES,'Provide existing DEV fixture directory');
const config=await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');
const publicKey=config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const out=process.env.BRAND_OUTPUT_DIR??'test-results/brand';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const report={origin,startedAt:new Date().toISOString(),mocks:false,viewportWidths:[1440,834],locales:['en','es'],screens:[],functional:[],assetHashes:[],pageErrors:[]};
async function brandStates(p){
 const values=await p.evaluate(()=>{
  const s=getComputedStyle(document.documentElement);const names=['navy','navy-raised','on-navy','on-navy-muted','blue','blue-hover','blue-text','blue-soft','control-line','canvas','ink','muted','surface-soft','success','success-soft','warning','warning-soft','danger','danger-soft'];
  return Object.fromEntries(names.map(n=>[n,s.getPropertyValue('--'+n).trim()]));
 });
 const rgb=hex=>hex.replace('#','').match(/../g).map(v=>parseInt(v,16));
 const pairs=[['on-navy','navy-raised',4.5],['on-navy-muted','navy-raised',4.5],['blue','navy',3],['control-line','canvas',3],['blue-text','blue-soft',4.5],['muted','surface-soft',4.5],['success','success-soft',4.5],['warning','warning-soft',4.5],['danger','danger-soft',4.5]];
 report.tokenContrast=pairs.map(([fg,bg,min])=>{const ratio=contrast(rgb(values[fg]),rgb(values[bg]));assert(ratio>=min,`${fg}/${bg} contrast`);return {fg:values[fg],bg:values[bg],pair:fg+'/'+bg,min,ratio};});
 report.gradientContrastNote='Login text checked against navy-raised, the lighter endpoint and radial color of its navy gradient; decorative circles excluded.';
 const input=p.getByLabel('Email address',{exact:true});await input.focus();
 const focus=await p.locator('.field-control').first().evaluate(e=>({border:getComputedStyle(e).borderColor,shadow:getComputedStyle(e).boxShadow}));assert.equal(focus.border,'rgb(18, 104, 254)');
 const button=p.getByRole('button',{name:'Sign in',exact:true});await button.hover();await p.waitForTimeout(180);
 const hover=await button.evaluate(e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));assert.equal(hover.bg,'rgb(7, 83, 214)');
 await button.click();await p.locator('.form-error').waitFor();await screen(p,'login-required-error-'+p.viewportSize().width);
 report.controlStates??=[];report.controlStates.push({width:p.viewportSize().width,inputFocus:focus,buttonHover:hover,requiredFieldError:true});
 await p.reload();await heading(p,'Sign in to your workspace');
}
const heading=(p,n)=>p.getByRole('heading',{name:n,exact:true}).waitFor();
function luminance(rgb){return rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
function contrast(fg,bg){const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
async function screen(p,name){
 await p.evaluate(()=>document.fonts.ready);
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${name}`);
 const styles=await p.evaluate(()=>{
  const rgb=c=>c.match(/[\d.]+/g)?.map(Number)??[];
  const nodes=[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
  const samples=[];
  for(const e of nodes){
   const s=getComputedStyle(e);if(s.visibility==='hidden'||s.opacity==='0')continue;
   let bg=null,gradient=false;
   for(let x=e;x;x=x.parentElement){const z=getComputedStyle(x);if(z.backgroundImage!=='none'){gradient=true;break;}const c=rgb(z.backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}}
   if(gradient||!bg)continue;
   const fg=rgb(s.color);if(fg.length===4&&fg[3]!==1)continue;
   const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700);
   samples.push({selector:e.tagName.toLowerCase()+'.'+[...e.classList].join('.'),fg,bg,min:large?3:4.5});
  }
  const logos=[...document.querySelectorAll('.brand-logo')].filter(e=>e.getClientRects().length).map(e=>({src:new URL(e.src).pathname,loaded:e.complete&&e.naturalWidth>0,inverse:!!e.closest('.sidebar,.auth-side')}));
  return {samples,logos,sidebar:document.querySelector('.sidebar')?getComputedStyle(document.querySelector('.sidebar')).backgroundColor:null};
 });
 for(const logo of styles.logos){assert(logo.loaded,`logo loaded ${name}`);assert.equal(logo.src,`/brand/playerp-logo-horizontal${logo.inverse?'-white':''}.png`);}
 if(styles.sidebar)assert.equal(styles.sidebar,'rgb(2, 25, 63)');
 const failures=styles.samples.map(s=>({...s,ratio:Math.round(contrast(s.fg,s.bg)*100)/100})).filter(s=>s.ratio<s.min);
 assert.deepEqual(failures,[],`text contrast ${name}`);
 const file=name+'.png';await p.screenshot({path:`${out}/${file}`,fullPage:true,animations:'disabled'});
 report.screens.push({name,path:new URL(p.url()).pathname,lang:await p.locator('html').getAttribute('lang'),width:p.viewportSize().width,noHorizontalOverflow:true,logos:styles.logos,textContrastSamples:styles.samples.length,minimumTextRatio:Math.min(...styles.samples.map(s=>contrast(s.fg,s.bg))),screenshot:file});
}
async function login(p,profile){
 const a=accounts[profile];assert(a?.email?.endsWith('@resend.dev'));
 await p.goto(origin+'/');await heading(p,'Sign in to your workspace');
 await p.getByLabel('Email address',{exact:true}).fill(a.email);await p.getByLabel('Password',{exact:true}).fill(a.password);
 await p.getByRole('button',{name:'Sign in',exact:true}).click();
 await heading(p,profile==='staff_activo'?'A clear view across PlayERP.':'Your spaces, in one place.');
}
async function logout(p){
 await p.getByRole('button',{name:'EN',exact:true}).click();await p.locator('.account-trigger').click();
 await p.locator('.account-popover').getByRole('button',{name:'Sign out',exact:true}).click();await heading(p,'Sign in to your workspace');
 assert.equal(await p.evaluate(()=>localStorage.getItem('playerp.portal.dev.auth')),null);
 await p.reload();await heading(p,'Sign in to your workspace');
}
const contexts=[];
try{
 for(const width of [1440,834]){
  const ctx=await browser.newContext({viewport:{width,height:1000},locale:'en'});contexts.push(ctx);
  const p=await ctx.newPage();p.setDefaultTimeout(20000);p.on('pageerror',()=>report.pageErrors.push('Browser runtime error'));
  const businessWrites=[];
  p.on('request',r=>{if(r.url().includes('fzwzmwstxlsxdzdmphyq.supabase.co')){const path=new URL(r.url()).pathname;if(path.startsWith('/functions/')&&r.postDataJSON()?.action!=='list')businessWrites.push(path);if(!['GET','OPTIONS'].includes(r.method())&&path.startsWith('/rest/v1/')&&!path.startsWith('/rest/v1/rpc/'))businessWrites.push(path);}});
  for(const lang of ['en','es']){
   await p.goto(origin+'/auth/login');await p.getByRole('button',{name:lang.toUpperCase(),exact:true}).click();
   await heading(p,lang==='en'?'Sign in to your workspace':'Accede a tu espacio');await screen(p,`login-${width}-${lang}`);
  }
  await p.getByRole('button',{name:'EN',exact:true}).click();
  await brandStates(p);
  await login(p,'staff_activo');assert.equal(new URL(p.url()).pathname,'/admin');
  for(const lang of ['en','es']){
   await p.getByRole('button',{name:lang.toUpperCase(),exact:true}).click();
   await p.goto(origin+'/admin');await p.locator('.stats-grid').waitFor();await screen(p,`admin-${width}-${lang}`);
   if(width===834){await p.locator('.mobile-nav-button').click();await p.locator('.sidebar-open').waitFor();await p.waitForFunction(()=>Math.abs(document.querySelector('.sidebar').getBoundingClientRect().left)<1);await screen(p,`navigation-${width}-${lang}`);await p.locator('.sidebar-close').click();await p.locator('.sidebar-open').waitFor({state:'detached'});}
   await p.goto(origin+'/admin/tenants');await p.locator('.directory-row').first().waitFor();
   const count=await p.locator('.directory-row').count();assert(count>0);await screen(p,`directory-${width}-${lang}`);
   await p.getByRole('searchbox').fill('adventure-park-demo');assert.equal(await p.locator('.directory-row').count(),1);
   await p.locator('.directory-row').click();await p.locator('.servers-table tbody tr').first().waitFor();
   const servers=await p.locator('.servers-table tbody tr').count();assert(servers>0);
   await p.reload();await p.locator('.servers-table tbody tr').first().waitFor();await screen(p,`detail-${width}-${lang}`);
   report.functional.push({profile:'staff_activo',width,lang,login:'/admin',directoryRows:count,detail:'adventure-park-demo',printServerRows:servers,reload:true});
   await p.goto(origin+'/admin/staff');await p.locator('.staff-table tbody tr').first().waitFor();await screen(p,`staff-${width}-${lang}`);
  }
  await logout(p);report.functional.push({profile:'staff_activo',width,logout:true,authStorageCleared:true,reload:'login'});
  await login(p,'owner_varios');assert.equal(new URL(p.url()).pathname,'/');
  for(const lang of ['en','es']){
   await p.getByRole('button',{name:lang.toUpperCase(),exact:true}).click();await p.locator('.owner-venue-card').waitFor();
   const select=p.locator('.venue-select select'),options=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));assert(options.length>1);
   const previous=await select.inputValue(),next=options.find(v=>v!==previous);await select.selectOption(next);await p.reload();await p.locator('.owner-venue-card').waitFor();assert.equal(await select.inputValue(),next);
   await screen(p,`owner-${width}-${lang}`);
   await p.goto(origin+'/admin/staff');await p.locator('.owner-venue-card').waitFor();assert.equal(new URL(p.url()).pathname,'/');assert.equal(await p.locator('.staff-table').count(),0);
   report.functional.push({profile:'owner_varios',width,lang,login:'/',selectionPersists:true,adminDenied:true});
  }
  await logout(p);report.functional.push({profile:'owner_varios',width,logout:true,authStorageCleared:true,reload:'login'});
  assert.deepEqual(businessWrites,[]);await ctx.close();contexts.pop();
 }
 for(const asset of ['playerp-logo-horizontal.png','playerp-logo-horizontal-white.png','playerp-favicon-32.png','playerp-favicon-192.png']){
  const response=await fetch(origin+'/brand/'+asset);assert.equal(response.status,200);
  const served=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  const repo=createHash('sha256').update(await readFile(new URL('../public/brand/'+asset,import.meta.url))).digest('hex');
  assert.equal(served,repo);report.assetHashes.push({asset,served,repo});
 }
 assert.deepEqual(report.pageErrors,[]);report.passed=true;
}finally{
 // Revoke only sessions opened by this script if an assertion interrupted a pass.
 for(const ctx of contexts){for(const p of ctx.pages()){
  await p.evaluate(async publicKey=>{const raw=localStorage.getItem('playerp.portal.dev.auth');if(!raw)return;const session=JSON.parse(raw);
   if(session?.access_token)await fetch('https://fzwzmwstxlsxdzdmphyq.supabase.co/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+session.access_token}}).catch(()=>{});localStorage.removeItem('playerp.portal.dev.auth');},publicKey).catch(()=>{});
 }await ctx.close();}
 report.completedAt=new Date().toISOString();await writeFile(`${out}/brand-live.json`,JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify({passed:report.passed,screens:report.screens.length,functional:report.functional.length,origin}));
