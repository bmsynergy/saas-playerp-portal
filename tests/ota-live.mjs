// PE-385 — pasada en vivo de la pestaña Actualizaciones en el portal PUBLICADO (playerp.dev) con
// cuentas reales de DEV y un PS SIMULADO (el updater 1.0.0 corre en una raíz de prueba del VPS).
// No imprime contraseñas, tokens ni URLs firmadas.
//   PORTAL_DEV_FIXTURES=… OTA_WORK=… OTA_PS=<ps simulado> OTA_EDITIONS=… OTA_LAB=…/ota_lab.py node tests/ota-live.mjs
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'https://playerp.dev.bmore.app';
const api = 'https://fzwzmwstxlsxdzdmphyq.supabase.co';
const accounts = JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`, 'utf8'));
const ed = JSON.parse(await readFile(process.env.OTA_EDITIONS, 'utf8'));
const PS = process.env.OTA_PS;
const out = process.env.LIVE_OUTPUT_DIR ?? 'docs/evidence/pe385-ota'; await mkdir(out, { recursive: true });
const anon = (await readFile('src/lib/config.ts', 'utf8')).match(/SUPABASE_PUBLIC_KEY\s*=\s*"([^"]+)"/)[1];
const log = (k, v) => console.log(k.padEnd(52), typeof v === 'string' ? v : JSON.stringify(v));
const sql = async (query) => (await fetch(`https://api.supabase.com/v1/projects/fzwzmwstxlsxdzdmphyq/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'playerp-mig/1.0' }, body: JSON.stringify({ query }) })).json();
const tokenOf = async (p) => (await (await fetch(`${api}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[p].email, password: accounts[p].password }) })).json()).access_token;
const call = async (tok, path, body) => { const r = await fetch(`${api}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }); return { status: r.status, data: await r.json().catch(() => null) }; };
const updater = (name, fresh) => { try { return execFileSync('python3', ['-I', process.env.OTA_LAB, 'run', process.env.OTA_WORK, name, fresh ? 'fresh' : ''], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } }); } catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? ''); } };
const lastLine = (s) => s.trim().split('\n').filter(Boolean).slice(-1)[0]?.replace(/^\[[^\]]+\] /, '') ?? '';
const started = new Date().toISOString();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
async function login(page, profile) {
  await page.goto(origin + '/auth/login?lang=en');
  await page.getByLabel('Email address', { exact: true }).fill(accounts[profile].email);
  await page.getByLabel('Password', { exact: true }).fill(accounts[profile].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth/'));
}
async function result(page) {
  await page.locator('[data-testid="ota-result"][data-ok]').waitFor();
  const r = { ok: await page.getByTestId('ota-result').getAttribute('data-ok'), text: (await page.getByTestId('ota-result').innerText()).trim() };
  return r;
}
async function deployDevices(page, edition, ring) {
  await page.getByTestId('ota-deploy-edition').selectOption(edition);
  await page.getByTestId('ota-deploy-mode').selectOption('devices');
  await page.getByTestId('ota-deploy-ring').selectOption(ring);
  const box = page.getByTestId(`ota-deploy-device-${PS}`); if (!(await box.isChecked())) await box.check();
  await page.getByTestId('ota-deploy-submit').click();
  return result(page);
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage(); page.setDefaultTimeout(30_000);
  page.on('dialog', d => d.accept());
  await login(page, 'staff_activo');
  log('Admin de plataforma (sesión real)', accounts.staff_activo.email.replace(/^(.{6}).*(@.*)$/, '$1…$2'));
  await page.goto(origin + '/admin/print-servers/updates?lang=en');
  await page.getByTestId('updates-page').waitFor();
  log('ediciones firmadas visibles', String(await page.locator('[data-testid^="ota-signed-"]').count()));
  // 1. Grupo canary con el PS simulado
  const gname = `PE-385 canary · PS simulado ${started.slice(11, 19)}`;
  await page.getByTestId('ota-group-name').fill(gname);
  await page.getByTestId('ota-group-ring').selectOption('canary');
  await page.getByTestId('ota-group-create').click();
  log('crear grupo canary', await result(page));
  const gid = (await sql(`select id from public.ps_ota_groups where name = '${gname}'`))[0].id;
  await page.getByTestId(`ota-group-edit-${gid}`).click();
  await page.getByTestId(`ota-member-${gid}-${PS}`).check();
  await page.getByTestId(`ota-group-save-${gid}`).click();
  log('miembros del grupo (PS simulado)', await result(page));
  // 2. General antes de canary -> error
  const g1 = await deployDevices(page, ed['0.3.6-sim.1'].edition, 'general');
  log('desplegar 0.3.6-sim.1 en GENERAL antes de canary', g1); assert.equal(g1.ok, 'false');
  // 3. Al grupo canary
  await page.getByTestId('ota-deploy-edition').selectOption(ed['0.3.6-sim.1'].edition);
  await page.getByTestId('ota-deploy-mode').selectOption('group');
  await page.getByTestId('ota-deploy-group').selectOption(gid);
  await page.getByTestId('ota-deploy-submit').click();
  const g2 = await result(page); log('desplegar 0.3.6-sim.1 al grupo canary', g2); assert.equal(g2.ok, 'true');
  log('updater del PS simulado (raíz de prueba 0.3.5)', lastLine(updater('portal-pasada', true)));
  const canary = (await sql(`select canary_confirmed_at from public.ps_ota_editions where id = '${ed['0.3.6-sim.1'].edition}'`))[0];
  log('edición confirmada en canary', canary.canary_confirmed_at);
  // 4. A un aparato, ya en general (permitido tras canary): versión con salud rota -> restaurado
  await page.reload(); await page.getByTestId('updates-page').waitFor();
  const g3 = await deployDevices(page, ed['0.3.6-sim.2'].edition, 'general');
  log('desplegar 0.3.6-sim.2 al aparato (general, tras canary)', g3); assert.equal(g3.ok, 'true');
  log('updater del PS simulado', lastLine(updater('portal-pasada', false)));
  const t = (await sql(`select id, status, phase, progress, error_code, error_detail, desired_version, installed_version from public.ps_ota_targets where print_server_id = '${PS}' order by issued_at desc limit 2`));
  log('objetivo del aparato (portal)', t[0]); log('objetivo del grupo canary (portal)', t[1]);
  log('ps_ota_events de esos objetivos', (await sql(`select target_id, count(*)::int n, string_agg(phase || ':' || status, ' > ' order by id) fases from public.ps_ota_events where target_id in ('${t[0].id}','${t[1].id}') group by target_id`)));
  log('admin_audit_log ps_ota_* de esta pasada', (await sql(`select action, count(*)::int n from public.admin_audit_log where action like 'ps_ota_%' and created_at >= '${started}' group by action order by action`)));
  // 5. Capturas EN y ES de lo publicado
  await page.reload(); await page.getByTestId('updates-page').waitFor();
  await page.getByTestId(`ota-device-${PS}`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/updates-en.png`, fullPage: true });
  await page.goto(origin + '/admin/print-servers/updates?lang=es'); await page.getByTestId('updates-page').waitFor();
  await page.getByTestId(`ota-device-${PS}`).waitFor();
  await page.screenshot({ path: `${out}/updates-es.png`, fullPage: true });
  log('capturas', [`${out}/updates-en.png`, `${out}/updates-es.png`]);
  await ctx.close();
  // 6. Owner (owner_uno, dueño del venue del PS simulado)
  const venue = (await sql(`select venue_id from public.print_servers where id = '${PS}'`))[0].venue_id;
  const other = '7c0f986f-2f28-4238-9080-279be48a0cc1';
  const o = await tokenOf('owner_uno');
  const own = await call(o, '/rest/v1/rpc/ps_panel_ota', { p_venue_id: venue });
  log('owner · ps_panel_ota de SU venue', { status: own.status, keys: Object.keys(own.data?.print_servers?.[0] ?? {}), ps: own.data?.print_servers?.map(p => ({ installed: p.installed_version, desired: p.desired_version, status: p.status })) });
  const rd = await call(o, '/rest/v1/rpc/ps_panel_ota', { p_venue_id: other }); log('owner · ps_panel_ota de OTRO local', [rd.status, rd.data?.code]);
  const dep = await call(o, '/functions/v1/ps-ota-admin', { action: 'deploy', edition_id: ed['0.3.6-sim.1'].edition, ring: 'lab', print_server_ids: [PS] }); log('owner · desplegar', [dep.status, dep.data?.code]);
  const sg = await call(o, '/functions/v1/ps-ota-admin', { action: 'sign', release_id: ed['0.3.6-sim.1'].release }); log('owner · firmar', [sg.status, sg.data?.code]);
  const gc = await call(o, '/rest/v1/rpc/ps_ota_group_create', { p_name: 'owner', p_ring: 'lab' }); log('owner · crear grupo', [gc.status, gc.data?.code]);
  const ov = await call(o, '/rest/v1/rpc/ps_ota_admin_overview', {}); log('owner · vista global de despliegues', [ov.status, ov.data?.code]);
  for (const r of [rd, dep, sg, gc, ov]) assert.equal((r.data?.code), '42501');
  const octx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const opage = await octx.newPage(); opage.setDefaultTimeout(30_000);
  await login(opage, 'owner_uno');
  await opage.goto(origin + '/admin/print-servers/updates'); await opage.waitForTimeout(3000);
  log('owner abre /admin/print-servers/updates · formulario de despliegue visible', String(await opage.getByTestId('ota-deploy-form').count()));
  await octx.close();
  console.log('PASADA OK');
} finally { await browser.close(); }
