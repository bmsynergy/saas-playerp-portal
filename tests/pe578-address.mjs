// Visual-only regression of PE-577's existing venue fixture; no data mutations.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { devSession } from './pe577-session.mjs';
const origin = process.env.PORTAL_TEST_ORIGIN || 'http://127.0.0.1:18799';
assert(['http://127.0.0.1:18799', 'https://playerp.dev.bmore.app'].includes(origin));
const out = process.env.VISUAL_OUTPUT_DIR || 'test-results/pe578';
await mkdir(out, { recursive: true });
const venueId = '08d3d13a-8816-41f6-8fdc-811f67de40dc';
const { session, rpc } = await devSession();
const before = await rpc('platform_venue_address', { p_venue_id: venueId });
const browser = await chromium.launch({headless:true, executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', args:['--no-sandbox']});
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
await context.addInitScript(s => { localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s)); }, session);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const panel = page.locator('.platform-subdomain-panel');
const report = { origin, venueId, checks: [], passed: false };
let fixture = null;
const mutations = [];
await page.route('**/rest/v1/rpc/**', async route => {
 const name = route.request().url().split('/').pop();
 if (name === 'platform_venue_address' && fixture) return route.fulfill({json:fixture});
 if (/change|commit|create|update|delete|assign|revoke/.test(name)) { mutations.push(name); return route.abort(); }
 return route.continue();
});
const go = async (lang='es') => {
 await page.goto(`${origin}/admin/tenants/${venueId}?lang=${lang}`);
 await expect(panel.locator('.platform-subdomain-current')).toBeVisible();
};
try {
 for (const lang of ['es','en']) for (const width of [390,1440]) {
  await page.setViewportSize({width,height:1000}); await go(lang);
  await expect(panel.getByRole('heading', {name:lang==='es'?'Dirección de PlayERP':'PlayERP address',exact:true})).toBeVisible();
  await expect(panel).toContainText(before.platform_subdomain.domain);
  assert.equal(await panel.locator('a').count(),0);
  for (const text of ['Environment', 'Current app:', 'Current portal:', 'Internal slug', 'Primary external domain', 'Entorno', 'App vigente:', 'Portal vigente:', 'Slug interno', 'Dominio externo principal']) await expect(panel).not.toContainText(text);
  const details = panel.locator('details');
  assert.equal(await details.getAttribute('open'),null);
  await expect(details.locator('summary')).toContainText(String(before.aliases.length));
  await panel.screenshot({path:`${out}/current-${lang}-${width}.png`});
  await details.locator('summary').click();
  for (const alias of before.aliases) await expect(details).toContainText(alias.domain);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await panel.screenshot({path:`${out}/history-${lang}-${width}.png`});
  report.checks.push({lang,width,defaultCollapsed:true,historyCount:before.aliases.length,noOverflow:true,pendingNotLinked:true});
 }
 // All four existing link guards must agree, including contradictory server fixtures.
 fixture=structuredClone(before);
 fixture.platform_subdomain={...fixture.platform_subdomain,operational:true,environment_state:'live',serving_state:'verified',public_url:'https://pe578-fixture.playerp.dev.bmore.app'};
 await go(); await expect(panel.getByRole('link',{name:'Abrir sitio',exact:true})).toHaveAttribute('href',fixture.platform_subdomain.public_url);
 const live = structuredClone(fixture);
 for (const [field,value] of [['operational',false],['environment_state','pending_relocation'],['serving_state','pending_verification'],['public_url',null]]) {
  fixture=structuredClone(live);fixture.platform_subdomain[field]=value;await go();
  assert.equal(await panel.getByRole('link').count(),0);
  assert.equal(await panel.getByText('Disponible',{exact:true}).count(),0);
 }
 report.checks.push({allFourAvailabilityGuards:true});
 for (const [addressState,servingState,domain,status] of [
  ['ambiguous','pending_verification',null,'Ambiguo'],
  ['not_configured','none',null,'Sin configurar'],
  ['configured','disabled',before.platform_subdomain.domain,'Desactivado']
 ]) {
  fixture=structuredClone(before);
  Object.assign(fixture.platform_subdomain,{address_state:addressState,serving_state:servingState,domain});
  await go();await expect(panel.locator('.platform-subdomain-status')).toHaveText(status);
  assert.equal(await panel.getByRole('link').count(),0);
  if(addressState==='ambiguous') assert.equal(await panel.getByRole('button',{name:'Cambiar subdominio',exact:true}).count(),0);
 }
 report.checks.push({ambiguousUnconfiguredDisabled:true});
 fixture=structuredClone(before);
 fixture.platform_subdomain.domain='a'.repeat(63)+'.playerp.dev.bmore.app';
 fixture.aliases=[{label:'long',domain:'b'.repeat(63)+'.playerp.dev.bmore.app',status:'verified'},...before.aliases];
 for (const lang of ['es','en']) for (const width of [390,1440]) {
  await page.setViewportSize({width,height:1000}); await go(lang);await panel.locator('summary').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await panel.getByRole('link').count(),0);
  await panel.screenshot({path:`${out}/long-${lang}-${width}.png`});
 }
 report.checks.push({longUrlsBothLanguagesAndWidths:true,verifiedAliasNotOperational:true});
 fixture=null;await go();
 const copy=panel.getByRole('button',{name:/Copiar dirección/});
 await copy.click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),before.platform_subdomain.domain);
 report.checks.push({copyMatchesSavedAddress:true});
 await panel.locator('summary').click();
 await panel.locator('details li').first().getByRole('button').click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),before.aliases[0].domain);
 report.checks.push({copyAliasMatchesSavedAddress:true});
 await panel.getByRole('button',{name:'Cambiar subdominio',exact:true}).click();
 await panel.locator('input').fill('admin');
 await expect(panel.locator('.platform-subdomain-invalid')).toBeVisible();
 await expect(panel.getByRole('button',{name:'Revisar cambio',exact:true})).toBeDisabled();
 report.checks.push({reservedNameStillRejected:true});
 assert.deepEqual(await rpc('platform_venue_address',{p_venue_id:venueId}),before);
 assert.deepEqual(mutations,[]);
 report.checks.push({savedDataUnchanged:true,mutations:0});
 report.passed=true;
} catch(error) { report.failure=error.message;process.exitCode=1;await page.screenshot({path:`${out}/failure.png`,fullPage:true}); }
finally { await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close(); }
