// PE-462 real screenshots against the published DEV portal. READ-ONLY: no API mocks, no clicks on
// Assign/Prepare/Save; only navigation, expanding a list card and reading. Credentials are never written.
// PORTAL_DEV_FIXTURES=/home/coredev/.coredeva-private/pe321-portal-dev node tests/pe462-live.mjs
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'https://playerp.dev.bmore.app';
assert(['https://playerp.dev.bmore.app', 'http://127.0.0.1:18799'].includes(origin));
const privateDir = process.env.PORTAL_DEV_FIXTURES ?? '/home/coredev/.coredeva-private/pe321-portal-dev';
const accounts = JSON.parse(await readFile(`${privateDir}/cuentas.json`, 'utf8'));
const api = 'https://fzwzmwstxlsxdzdmphyq.supabase.co';
const config = await readFile(new URL('../src/lib/config.ts', import.meta.url), 'utf8'); assert(config.includes(api));
const key = config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];
const out = process.env.LIVE_OUTPUT_DIR ?? '/home/coredev/saas-playerp-backend/_tests/pe462-ps-link/capturas';
await mkdir(out, { recursive: true });
const venueId = 'f4430000-0000-4000-8000-0000000000f1';
const ASG = 'PS-PE462ASG', NVP = 'PS-PE462NVP';
const STATE_ES = { pendiente_preparacion: 'Pendiente de preparación', en_stock: 'En stock', asignado_pendiente_sync: 'Asignado · pendiente de sincronización', sincronizado: 'Sincronizado', retirado: 'Retirado' };
const report = { origin, mocks: false, readOnly: true, startedAt: new Date().toISOString(), expected: {}, views: [], blockedMutations: [] };

async function login(profile) {
  const r = await fetch(`${api}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[profile].email, password: accounts[profile].password }) });
  assert.equal(r.status, 200, `login ${profile}`); return r.json();
}
async function rpc(token, name, args = {}) {
  const r = await fetch(`${api}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  assert.equal(r.status, 200, name); return r.json();
}
const staff = await login('staff_activo'), owner = await login('owner_varios');
// Read-only lookups for the expected values (the same DTO the UI renders).
const inventory = await rpc(staff.access_token, 'portal_ps_devices');
const byS = serial => inventory.devices.find(d => d.serial === serial);
assert(byS(ASG) && byS(NVP), 'fixture devices present in inventory');
const asg = (await rpc(staff.access_token, 'ps_device_link_status', { p_device_id: byS(ASG).id })).link;
const nvp = (await rpc(staff.access_token, 'ps_device_link_status', { p_device_id: byS(NVP).id })).link;
const pick = l => ({ device_id: l.device_id, serial: l.serial, display_name: l.display_name, model: l.model_label ?? l.model, venue_name: l.venue_name, state: l.state, state_label: STATE_ES[l.state], reported: l.reported, onboarding: l.onboarding });
report.expected = { asg: pick(asg), nvp: pick(nvp) };

const browser = await chromium.launch({ headless: true, executablePath: '/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
async function page(session) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' });
  await ctx.addInitScript(s => { localStorage.setItem('playerp.portal.dev.auth', JSON.stringify(s)); localStorage.setItem('playerp.locale', 'es'); }, session);
  // Guard: any write through the link RPCs is aborted and recorded (the report then fails).
  await ctx.route(/\/rpc\/(ps_admin_device_(assign|move|prepare|revoke|delete)|ps_device_set_label)/, route => { report.blockedMutations.push(new URL(route.request().url()).pathname); return route.abort(); });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  return { ctx, p };
}
const settle = async p => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(800); };
async function view(file, p, expect) {
  const text = await p.locator('body').innerText();
  const checks = Object.entries(expect).map(([what, value]) => ({ what, value, ok: !!value && text.includes(value) }));
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300); // fixed shell must not overlay the full-page capture
  await p.screenshot({ path: `${out}/${file}`, fullPage: true });
  const pass = checks.every(c => c.ok);
  report.views.push({ file, url: p.url().replace(origin, ''), pass, checks });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${file}${pass ? '' : ' → ' + checks.filter(c => !c.ok).map(c => `${c.what}=${c.value}`).join(', ')}`);
}
const asgTexts = (extra = {}) => ({ serial: asg.serial, name: asg.display_name, model: asg.model_label ?? asg.model, venue: asg.venue_name, state: STATE_ES[asg.state], ...extra });
const sheetHref = async (p, serial) => { await p.locator(`[data-testid="inv-open-${serial}"]`).waitFor(); return p.locator(`[data-testid="inv-open-${serial}"]`).getAttribute('href'); };

try {
  {
    const { ctx, p } = await page(staff);
    await p.goto(`${origin}/admin/print-servers/inventory`); await p.getByText(ASG, { exact: true }).first().waitFor(); await settle(p);
    const asgHref = await sheetHref(p, ASG), nvpHref = await sheetHref(p, NVP);
    await view('2-inventario-admin.png', p, asgTexts({ nvpSerial: NVP, nvpState: STATE_ES[nvp.state], pending: 'Pendiente' }));
    await p.goto(origin + asgHref); await p.getByTestId('ps-link-panel').waitFor(); await settle(p);
    await view('1-ficha-admin-asg.png', p, asgTexts({ pending: 'Pendiente', explain: 'El vínculo está guardado' }));
    await p.goto(`${origin}/admin/print-servers/list`); await p.getByTestId(`ps-venue-${venueId}`).waitFor(); await settle(p);
    await p.locator(`[data-testid="ps-venue-${venueId}"] > summary`).click(); // expands the card (read-only)
    await p.locator(`[data-testid="ps-venue-${venueId}"]`).getByText(ASG).waitFor(); await p.locator(`[data-testid="ps-venue-${venueId}"]`).scrollIntoViewIfNeeded();
    await view('3-lista-global-admin.png', p, asgTexts({ pending: 'Pendiente' }));
    await p.goto(`${origin}/admin/tenants/${venueId}/print-servers`); await p.getByText(ASG).first().waitFor(); await settle(p);
    await view('4-lista-venue-admin.png', p, asgTexts({ pending: 'Pendiente' }));
    await p.goto(origin + nvpHref); await p.getByTestId('ps-preparation').waitFor(); await settle(p);
    await view('7-onboarding-nvp.png', p, { serial: nvp.serial, name: nvp.display_name, model: nvp.model_label ?? nvp.model, state: STATE_ES[nvp.state], block: 'Preparación del aparato', lead: 'Crear el inventario no configura la Raspberry', missing: nvp.onboarding.missing.length ? 'Falta:' : null, prepareButton: 'Preparar' });
    await ctx.close();
  }
  {
    const { ctx, p } = await page(owner);
    await p.goto(`${origin}/?venue=${venueId}&section=print-servers`); await p.getByText(ASG).first().waitFor(); await settle(p);
    await view('5-lista-venue-owner.png', p, asgTexts({ pending: 'Pendiente' }));
    const row = p.locator('tr', { hasText: ASG }).first();
    const href = await row.locator('a').first().getAttribute('href');
    await p.goto(origin + href); await p.getByTestId('ps-link-panel').waitFor(); await settle(p);
    await view('6-ficha-owner-asg.png', p, asgTexts({ pending: 'Pendiente', explain: 'El vínculo está guardado' }));
    await ctx.close();
  }
} catch (error) {
  report.error = String(error?.message ?? error).slice(0, 500);
  console.error('ERROR', report.error);
} finally {
  report.finishedAt = new Date().toISOString();
  report.pass = !report.error && !report.blockedMutations.length && report.views.length === 7 && report.views.every(v => v.pass);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(report.pass ? 'ALL PASS' : 'NOT ALL PASS');
  if (!report.pass) process.exitCode = 1;
}
