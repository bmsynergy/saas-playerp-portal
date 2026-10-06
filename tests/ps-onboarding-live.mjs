// PE-384 — DEV pass of Print Server onboarding on the PUBLISHED portal with real DEV accounts and a
// SIMULATED Print Server (plain HTTP to the real print-server edge). Venue: US Test Venue (owner_varios);
// its stale PE-336 simulated PS is replaced. Dynamic Park's lab PS is only read (before/after photo).
// Writes no password, token, credential, activation code or private key to the evidence.
//   PORTAL_DEV_FIXTURES=… SUPABASE_ACCESS_TOKEN=… PLAYWRIGHT_CHROMIUM_EXECUTABLE=… node tests/ps-onboarding-live.mjs
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const origin = 'https://playerp.dev.bmore.app', api = 'https://fzwzmwstxlsxdzdmphyq.supabase.co';
const PS = `${api}/functions/v1/print-server`;
const VENUE = '7c0f986f-2f28-4238-9080-279be48a0cc1', OTHER = 'b5a00000-0000-4000-8000-00000000000a', LAB = '78d05113-78f1-47e4-b558-c1b19451fa33';
const accounts = JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`, 'utf8'));
const anon = (await readFile(new URL('../src/lib/config.ts', import.meta.url), 'utf8')).match(/SUPABASE_PUBLIC_KEY\s*=\s*"([^"]+)"/)[1];
const out = process.env.LIVE_OUTPUT_DIR ?? 'docs/evidence/pe384-onboarding'; await mkdir(out, { recursive: true });
const log = []; const say = (k, v) => { const line = `${k.padEnd(44)} ${typeof v === 'string' ? v : JSON.stringify(v)}`; log.push(line); console.log(line); };
const sql = async (query) => { const r = await fetch('https://api.supabase.com/v1/projects/fzwzmwstxlsxdzdmphyq/database/query', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'playerp-mig/1.0' }, body: JSON.stringify({ query }) }); return r.json(); };
const login = async (p) => (await (await fetch(`${api}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[p].email, password: accounts[p].password }) })).json()).access_token;
const rpc = async (tok, fn, args = {}) => { const r = await fetch(`${api}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch {} return { status: r.status, data, text }; };
const ps = async (method, path, cred, body) => { const r = await fetch(PS + path, { method, headers: { ...(cred ? { Authorization: `Bearer ${cred}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch {} return { status: r.status, data, text }; };
const certEdge = async (tok, body) => { const r = await fetch(`${api}/functions/v1/ps-cert-admin`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch {} return { status: r.status, data, text }; };
const LAB_PHOTO = `select md5(row(s.id,s.venue_id,s.label,s.status,s.credential_hash,s.credential_hint,s.device_id,s.hostname,s.enrolled_at,s.revoked_at,s.ca_cert_der_sha256,s.inventory_device_id,s.https_cert_der_sha256)::text) ps,
  (select md5(coalesce(string_agg(row(p.id,p.label,p.mac_address,p.is_active,p.print_route,p.venue_id)::text, '|' order by p.id),'')) from public.cloud_printers p where p.venue_id=s.venue_id) printers,
  (select count(*) from public.print_server_commands c where c.print_server_id=s.id) commands
  from public.print_servers s where s.id='${LAB}'`;
const allResponses = [];
const tmp = mkdtempSync(`${tmpdir()}/pe384-`);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
async function page390(profile, lang) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: lang === 'es' ? 'es-ES' : 'en-US' });
  const page = await ctx.newPage(); page.setDefaultTimeout(30_000);
  await page.goto(`${origin}/auth/login?lang=${lang}`);
  await page.locator('input[type="email"]').fill(accounts[profile].email);
  await page.locator('input[type="password"]').fill(accounts[profile].password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth/'));
  return { ctx, page };
}
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); say('captura', `${name}.png`); };
try {
  const labBefore = (await sql(LAB_PHOTO))[0]; say('PS laboratorio (foto antes)', labBefore);
  const admin = await login('staff_activo'), owner = await login('owner_varios');

  // 1) Alta en inventario y asignación desde la pantalla (admin, ES, 390 px)
  const { ctx: actx, page: ap } = await page390('staff_activo', 'es');
  await ap.goto(`${origin}/admin/print-servers/inventory?lang=es`); await ap.getByTestId('devices-page').waitFor();
  await ap.getByTestId('inv-create').click(); await ap.locator('[data-testid="inv-result"][data-ok="true"]').waitFor();
  const serial = (await ap.getByTestId('inv-result').innerText()).match(/PS-[A-Z0-9]{8}/)[0];
  const dev = (await sql(`select d.id, d.serial, d.hostname, d.model, d.status, c.wifi_ssid, c.wifi_psk ~ '^[0-9]{10}$' psk_ok, c.admin_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$' code_ok from public.ps_devices d join public.ps_device_credentials c on c.device_id=d.id where d.serial='${serial}'`))[0];
  say('alta en inventario', { serial: dev.serial, hostname: dev.hostname, model: dev.model, status: dev.status });
  say('WPA2 10 dígitos / código 10 sin ambiguos', [dev.psk_ok, dev.code_ok]);
  const dupes = (await sql(`select (select count(*) - count(distinct serial) from public.ps_devices) dup_serial, (select count(*) - count(distinct hostname) from public.ps_devices) dup_hostname`))[0];
  say('serial/hostname duplicados en inventario', dupes);
  await ap.getByTestId(`inv-venue-${serial}`).selectOption(VENUE);
  await ap.getByTestId(`inv-assign-${serial}`).click(); await ap.getByTestId('inv-code').waitFor();
  const code = (await ap.getByTestId('inv-code-value').innerText()).trim();
  await ap.getByTestId('inv-code-value').evaluate(el => { el.textContent = 'pse_••••••••(oculto en la captura)'; });
  await shot(ap, 'inventario-asignar-es-390');
  await ap.getByTestId('inv-code-close').click();
  const stored = (await sql(`select count(*)::int n from public.print_servers where enrollment_code_hash is not null and enrollment_code_hash <> '' and venue_id='${VENUE}' and status='pending' and position('pse_' in enrollment_code_hash)=0`))[0];
  say('código de activación guardado solo como hash', stored.n === 1);

  // 2) Activación de un uso con el PS simulado
  const e1 = await ps('POST', '/v1/enroll', null, { enrollment_code: code, device_id: serial, hostname: 'raspberrypi', software_version: '0.3.5' });
  const cred = e1.data?.credential;
  say('activación 1ª vez', [e1.status, { serial: e1.data?.serial, hostname: e1.data?.hostname, wifi_ssid: e1.data?.wifi?.ssid }]);
  const e2 = await ps('POST', '/v1/enroll', null, { enrollment_code: code, device_id: serial, hostname: 'raspberrypi', software_version: '0.3.5' });
  say('activación 2ª vez (mismo código)', [e2.status, e2.data?.error]);
  assert.equal(e1.status, 200); assert.equal(e2.status, 401);
  await ps('POST', '/v1/status', cred, { version: '0.3.5', hostname: 'raspberrypi', queue_depth: 0 });
  const audit = await sql(`select action, target_type, metadata->>'serial' serial, created_at from public.admin_audit_log where action in ('ps_device_assigned','ps_device_replaced','ps_device_revoked') and created_at > now() - interval '10 minutes' order by created_at`);
  say('auditoría tras asignar/activar', audit.map(a => `${a.action}`));

  // 3) Owner: lectura de la ficha y rotación con el PS "apagado"
  const sheet = await rpc(owner, 'ps_panel_device', { p_venue_id: VENUE }); allResponses.push(sheet.text);
  say('owner lee su ficha', [sheet.status, { serial: sheet.data?.device?.serial, ssid: sheet.data?.wifi?.ssid, can_manage: sheet.data?.can_manage, is_platform_admin: sheet.data?.is_platform_admin }]);
  const leaks = /pst_|pse_|credential_hash|enrollment_code|channel_token|PRIVATE KEY/.test(sheet.text) || sheet.text.includes(cred);
  say('token técnico en la lectura del owner', leaks ? 'SÍ (fallo)' : 'ninguno');
  const state = await rpc(owner, 'ps_panel_state', { p_venue_id: VENUE }); allResponses.push(state.text);
  say('token técnico en ps_panel_state (owner)', (/pst_[0-9a-f]{20}|pse_|credential_hash/.test(state.text) || state.text.includes(cred)) ? 'SÍ (fallo)' : `ninguno (credential_hint=${state.data?.print_server?.credential_hint ? 'prefijo de 8' : 'null'})`);
  const oldPsk = sheet.data.wifi.psk;
  const { ctx: octx, page: op } = await page390('owner_varios', 'en');
  await op.goto(`${origin}/?venue=${VENUE}&section=print-servers&lang=en`); await op.getByTestId('ps-device-panel').waitFor();
  await op.getByTestId('dev-ssid').waitFor();
  await op.getByTestId('dev-rotate-wifi').click(); await op.getByTestId('dev-confirm-accept').click();
  await op.locator('[data-testid="dev-result"][data-ok="true"]').waitFor();
  await op.locator('[data-testid="dev-rotations"] li[data-status="pending"][data-kind="wifi"]').waitFor();
  await op.getByTestId('ps-device-panel').scrollIntoViewIfNeeded();
  await shot(op, 'owner-rotacion-pendiente-en-390');
  await new Promise(r => setTimeout(r, 4000));
  const rot = (await sql(`select id, status, expires_at > now() + interval '50 years' no_caduca from public.print_server_commands where venue_id='${VENUE}' and command_type='wifi_rotate' order by created_at desc limit 1`))[0];
  say('rotación con el PS sin contestar', { status: rot.status, sin_caducidad: rot.no_caduca });
  const pend = await rpc(owner, 'ps_panel_device', { p_venue_id: VENUE });
  say('owner ve la rotación / clave vigente', [pend.data.rotations[0].status, pend.data.wifi.psk === oldPsk ? 'sigue la anterior' : 'cambió (fallo)']);
  const cmds = await ps('GET', '/v1/commands', cred);
  const wcmd = cmds.data.commands.find(c => c.id === rot.id || c.command_id === rot.id);
  say('el PS recibe la orden al volver', [cmds.status, wcmd?.type ?? wcmd?.command_type, /^[0-9]{10}$/.test(wcmd?.params?.psk ?? '')]);
  const done = await ps('POST', `/v1/commands/${rot.id}/result`, cred, { status: 'done', result: { applied: true } });
  const after = await rpc(owner, 'ps_panel_device', { p_venue_id: VENUE });
  say('tras confirmar el PS', [done.status, after.data.rotations[0].status, after.data.wifi.psk === wcmd.params.psk ? 'clave nueva vigente' : 'no cambió (fallo)']);
  const r2 = await rpc(owner, 'ps_panel_rotate_admin_code', { p_venue_id: VENUE });
  const oldCode = after.data.wifi.admin_code;
  const failed = await ps('POST', `/v1/commands/${r2.data.command_id}/result`, cred, { status: 'failed', error_code: 'apply_failed' });
  const after2 = await rpc(owner, 'ps_panel_device', { p_venue_id: VENUE });
  say('rotación de código que el PS da por fallida', [failed.status, after2.data.rotations[0].status, after2.data.wifi.admin_code === oldCode ? 'sigue el código anterior' : 'cambió (fallo)']);
  await op.reload(); await op.locator('[data-testid="dev-rotations"] li[data-status="applied"]').waitFor();
  await op.getByTestId('ps-device-panel').scrollIntoViewIfNeeded();
  await shot(op, 'owner-ficha-aplicado-fallido-en-390');
  const qrText = await op.getByTestId('dev-qr').locator('img').getAttribute('alt');
  say('QR de la etiqueta', `alt="${qrText}" (contenido WIFI:T:WPA;S:<ssid>;P:<clave>;; — sin código administrativo)`);

  // 4) Owner: lo que NO puede
  for (const [name, fn, args] of [['flota (portal_ps_fleet)', 'portal_ps_fleet', {}], ['inventario (portal_ps_devices)', 'portal_ps_devices', {}], ['firmware (ps_firmware_list)', 'ps_firmware_list', {}],
    ['alta de aparato (ps_admin_device_create)', 'ps_admin_device_create', {}], ['renovar certificado (ps_admin_cert_renew)', 'ps_admin_cert_renew', { p_print_server_id: e1.data.print_server_id }],
    ['otro venue (ps_panel_device)', 'ps_panel_device', { p_venue_id: OTHER }], ['otro venue (ps_panel_state)', 'ps_panel_state', { p_venue_id: OTHER }]]) {
    const r = await rpc(owner, fn, args); say(`owner -> ${name}`, [r.status, r.data?.code]);
  }
  const oc = await certEdge(owner, { action: 'upload', print_server_id: e1.data.print_server_id, cert_pem: 'x' }); say('owner -> subir certificado (edge)', [oc.status, oc.data?.code]);

  // 5) Certificado HTTPS: renovar (admin, pantalla) -> el PS lo genera y confirma
  const host = e1.data.hostname;
  const mk = (name, cn) => { execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '825', '-subj', `/CN=${cn}`, '-addext', `subjectAltName=DNS:${cn},DNS:${cn}.local`, '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'keyUsage=critical,digitalSignature', '-addext', 'extendedKeyUsage=serverAuth', '-keyout', `${tmp}/${name}.key`, '-out', `${tmp}/${name}.pem`], { stdio: 'ignore' }); return readFileSync(`${tmp}/${name}.pem`, 'utf8'); };
  const fpOf = (name) => execFileSync('openssl', ['x509', '-in', `${tmp}/${name}.pem`, '-noout', '-fingerprint', '-sha256']).toString().trim().split('=')[1];
  const dates = (name) => Object.fromEntries(execFileSync('openssl', ['x509', '-in', `${tmp}/${name}.pem`, '-noout', '-startdate', '-enddate']).toString().trim().split('\n').map(l => { const [k, v] = l.split('='); return [k, new Date(v).toISOString()]; }));
  const certA = mk('a', host);
  await ap.goto(`${origin}/admin/print-servers/${VENUE}?lang=es`); await ap.getByTestId('ps-https-panel').waitFor();
  await ap.getByTestId('https-renew').click(); await ap.getByTestId('dev-confirm-accept').click(); await ap.locator('[data-testid="dev-result"][data-ok="true"]').waitFor();
  const renewCmd = (await sql(`select id, status from public.print_server_commands where venue_id='${VENUE}' and command_type='cert_renew' order by created_at desc limit 1`))[0];
  const dA = dates('a');
  const rd = await ps('POST', `/v1/commands/${renewCmd.id}/result`, cred, { status: 'done', result: { cert_pem: certA, hostname: host, not_before: dA.notBefore, not_after: dA.notAfter } });
  const s1 = await rpc(admin, 'ps_panel_device', { p_venue_id: VENUE }); allResponses.push(s1.text);
  const fpA = fpOf('a');
  say('renovar: el PS confirma', [rd.status, s1.data.cert_operations[0].kind, s1.data.cert_operations[0].status]);
  say('huella DER mostrada = openssl -fingerprint -sha256', [s1.data.cert.der_sha256, fpA, s1.data.cert.der_sha256.replace(/:/g, '').toLowerCase() === fpA.replace(/:/g, '').toLowerCase()]);
  say('vigencia y hostname mostrados', [s1.data.cert.hostname, s1.data.cert.not_before, s1.data.cert.not_after, s1.data.cert.status]);
  await ap.reload(); await ap.getByTestId('https-fingerprint').waitFor(); await ap.getByTestId('ps-https-panel').scrollIntoViewIfNeeded();
  await shot(ap, 'admin-certificado-renovado-es-390');
  const caKept = await rpc(owner, 'ps_panel_ca_cert', { p_venue_id: VENUE }); say('descarga de la CA de PE-339 (owner) sigue respondiendo', [caKept.status, caKept.data?.ok ?? caKept.data?.error]);
  const labCa = await rpc(admin, 'ps_panel_ca_cert', { p_venue_id: 'a0000000-0000-0000-0000-000000000001' }); say('descarga de la CA de PE-339 (laboratorio, admin)', [labCa.status, labCa.data?.ok, labCa.data?.ca_cert_der_sha256 ? 'con huella DER' : '']);

  // 6) Subir/reemplazar: otro hostname -> 400; con PRIVATE KEY -> 400; válido pero el PS dice key_mismatch -> fallido y sigue el anterior
  const certOther = mk('other', 'otro-host.example');
  const u1 = await certEdge(admin, { action: 'upload', print_server_id: e1.data.print_server_id, cert_pem: certOther }); allResponses.push(u1.text);
  say('subir con otro hostname', [u1.status, u1.data?.error]);
  const u2 = await certEdge(admin, { action: 'upload', print_server_id: e1.data.print_server_id, cert_pem: certA + readFileSync(`${tmp}/a.key`, 'utf8') }); allResponses.push(u2.text);
  say('subir con PRIVATE KEY', [u2.status, u2.data?.error]);
  const certB = mk('b', host);
  await ap.getByTestId('ps-https-panel').locator('summary').click();
  await ap.getByTestId('https-cert-pem').fill(certB); await ap.getByTestId('https-upload').click();
  await ap.locator('[data-testid="dev-result"][data-ok="true"]').waitFor();
  const instCmd = (await sql(`select id from public.print_server_commands where venue_id='${VENUE}' and command_type='cert_install' order by created_at desc limit 1`))[0];
  const kf = await ps('POST', `/v1/commands/${instCmd.id}/result`, cred, { status: 'failed', error_code: 'key_mismatch', error_detail: 'la clave local no corresponde al certificado' });
  const s2 = await rpc(admin, 'ps_panel_device', { p_venue_id: VENUE }); allResponses.push(s2.text);
  say('subir válido, el PS informa key_mismatch', [kf.status, s2.data.cert_operations[0].kind, s2.data.cert_operations[0].status, s2.data.cert_operations[0].error_code]);
  say('certificado vigente tras el fallo', s2.data.cert.der_sha256.replace(/:/g, '').toLowerCase() === fpA.replace(/:/g, '').toLowerCase() ? 'el anterior (A)' : 'cambió (fallo)');
  await ap.reload(); await ap.getByTestId('https-operations').waitFor(); await ap.getByTestId('ps-https-panel').scrollIntoViewIfNeeded();
  await shot(ap, 'admin-certificado-fallido-es-390');
  const { ctx: ectx, page: ep } = await page390('staff_activo', 'en');
  await ep.goto(`${origin}/admin/print-servers/${VENUE}?lang=en`); await ep.getByTestId('ps-device-panel').waitFor(); await ep.getByTestId('dev-ssid').waitFor();
  await ep.getByTestId('ps-device-panel').scrollIntoViewIfNeeded(); await shot(ep, 'admin-ficha-en-390');
  await ep.goto(`${origin}/admin/print-servers/inventory?lang=en`); await ep.getByTestId(`inv-row-${serial}`).waitFor(); await shot(ep, 'inventario-en-390');
  await ectx.close(); await octx.close();
  const { ctx: o2, page: op2 } = await page390('owner_varios', 'es');
  await op2.goto(`${origin}/?venue=${VENUE}&section=print-servers&lang=es`); await op2.getByTestId('dev-ssid').waitFor(); await op2.getByTestId('ps-device-panel').scrollIntoViewIfNeeded();
  await shot(op2, 'owner-ficha-es-390'); await o2.close();
  say('PRIVATE KEY en alguna respuesta guardada', allResponses.some(t => /PRIVATE KEY/.test(t)) ? 'SÍ (fallo)' : `ninguna (${allResponses.length} respuestas)`);

  // 7) Reemplazo y revocación auditados (segundo aparato reemplaza al primero; se revoca el segundo)
  const c2 = await rpc(admin, 'ps_admin_device_create', { p_model: 'rpi4-2gb' }); const serial2 = c2.data.device.serial;
  const as2 = await rpc(admin, 'ps_admin_device_assign', { p_device_id: c2.data.device.id, p_venue_id: VENUE });
  const e3 = await ps('POST', '/v1/enroll', null, { enrollment_code: as2.data.enrollment_code, device_id: serial2, hostname: 'raspberrypi', software_version: '0.3.5' });
  const oldCred = await ps('GET', '/v1/commands', cred);
  say('reemplazo: activa el 2º, credencial del 1º', [e3.status, oldCred.status]);
  const rv = await rpc(admin, 'ps_admin_device_revoke', { p_device_id: c2.data.device.id, p_reason: 'pe384_prueba' });
  say('revocar el 2º', [rv.status, rv.data?.ok, rv.data?.device?.status]);
  const as3 = await rpc(admin, 'ps_admin_device_assign', { p_device_id: dev.id, p_venue_id: VENUE });
  const e4 = await ps('POST', '/v1/enroll', null, { enrollment_code: as3.data.enrollment_code, device_id: serial, hostname: 'raspberrypi', software_version: '0.3.5' });
  await ps('POST', '/v1/status', e4.data?.credential, { version: '0.3.5', hostname: 'raspberrypi', queue_depth: 0 });
  say('se deja el 1º activo de nuevo en US Test Venue', [e4.status, serial]);
  const audit2 = await sql(`select action, metadata->>'serial' serial from public.admin_audit_log where action in ('ps_device_assigned','ps_device_replaced','ps_device_revoked') and (metadata->>'serial' in ('${serial}','${serial2}') or target_id in ('${dev.id}','${c2.data.device.id}')) order by created_at`);
  say('filas de admin_audit_log', audit2.map(a => `${a.action}:${a.serial ?? ''}`));
  const labAfter = (await sql(LAB_PHOTO))[0]; say('PS laboratorio (foto después)', labAfter);
  say('foto del laboratorio igual', JSON.stringify(labBefore) === JSON.stringify(labAfter));
  await actx.close();
} finally {
  await browser.close(); rmSync(tmp, { recursive: true, force: true });
  await writeFile(`${out}/salida.txt`, log.join('\n') + '\n');
}
