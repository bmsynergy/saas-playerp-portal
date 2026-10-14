// PE442: isolated browser consumer checks. Every remote request is intercepted.
// These responses are final-contract UI fixtures, never server/physical evidence.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'http://127.0.0.1:18799';
const out = process.env.SMOKE_OUTPUT_DIR ?? 'docs/evidence/pe442-lifecycle';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const uid = '11111111-1111-4111-8111-111111111111', venue = '22222222-2222-4222-8222-222222222222';
const date = '2026-10-14T00:00:00Z';
const user = { id: uid, email: 'fixture-pe442@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: date };
const exp = Math.floor(Date.now() / 1000) + 3600, enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = { access_token: `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: uid, exp, iat: exp - 3600, aud: 'authenticated', role: 'authenticated', session_id: uid })}.synthetic`, refresh_token: 'synthetic', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
const lifecycle = (i, signed = true) => ({
  contract_version: 1, edition_id: signed ? `fixture-edition-${i}` : null, edition_status: signed ? 'signed' : null,
  signed_by: signed ? uid : null, signed_by_email: signed ? user.email : null, signed_at: signed ? date : null, key_id: signed ? 'fixture-key-public' : null,
  canary_confirmed_at: null, lab_only: false, configuration: 'explicit', revision: 1, open_targets: 0, retired_at: null, retired_by: null,
  rings: { lab: { enabled: signed, eligible: signed, available: signed, reason: signed ? null : 'edition_not_signed' }, canary: { enabled: false, eligible: signed, available: false, reason: signed ? null : 'edition_not_signed' }, general: { enabled: false, eligible: false, available: false, reason: 'canary_not_confirmed' } },
  can_sign: !signed, sign_block_reason: null, can_manage: signed, can_retire: signed, retire_block_reason: null,
});
const makeRelease = i => ({ id: `fixture-release-${i}`, version: i === 1 ? '9.0.0' : `9.0.${i}`, revision: `fixture-pe442-${i}`, model: 'rpi4-2gb', arch: 'arm64', filename: `fixture-pe442-${i}.zip`, sha256: 'a'.repeat(64), status: 'ready', notes: 'ISOLATED UI FIXTURE — no real release, no physical device.', created_at: date, uploaded_by_email: user.email, size_bytes: 1000000, installed_count: i < 2 ? 3 : 0, lifecycle: lifecycle(i, i !== 0) });
const report = { kind: 'Isolated final-contract browser fixtures. Not backend acceptance and not physical OTA.', checks: [], errors: [], physicalDeployRequests: 0 };
async function setup(width, lang) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, locale: lang });
  await ctx.addInitScript(({ session, lang }) => { localStorage.setItem('playerp.portal.dev.auth', JSON.stringify(session)); localStorage.setItem('playerp.locale', lang); }, { session, lang });
  const releases = Array.from({ length: 28 }, (_, i) => makeRelease(i));
  releases[2].lifecycle.retired_at = date; releases[2].lifecycle.retired_by = uid; releases[2].lifecycle.rings.lab.available = false;
  releases[1].lifecycle.configuration = 'legacy'; releases[1].lifecycle.sign_block_reason = 'already_signed';
  releases[3].lifecycle = null; // Legacy backend / missing additive contract must fail closed.
  releases[4].lifecycle.lab_only = true; releases[4].lifecycle.rings.canary.eligible = false; releases[4].lifecycle.rings.canary.reason = 'edition_lab_only'; releases[4].lifecycle.rings.general.reason = 'edition_lab_only';
  const state = { releases, signMode: 'changed', availabilityMode: 'ok', failRead: false, calls: [], signCalls: 0, writes: 0, upload: null, history: [{ id: 'fixture-history', edition_id: 'fixture-edition-1', version: '9.0.0', ring: 'lab', group_id: null, group_name: null, created_at: date, created_by_email: user.email, target_count: 1, target_by_status: { committed: 1 } }] };
  await ctx.route(url => !url.href.startsWith(origin), async route => {
    const url = new URL(route.request().url()), name = url.pathname.split('/').pop();
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.abort();
    if (url.hostname !== 'fzwzmwstxlsxdzdmphyq.supabase.co') { report.errors.push(`Unexpected external host ${url.hostname}`); return route.abort(); }
    const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.startsWith('/auth/v1/')) return send(url.pathname.endsWith('/user') ? user : session);
    if (url.pathname.startsWith('/storage/v1/')) return send({ Key: 'fixture-only', Id: 'fixture-only' });
    if (name === 'staff_profiles') return send(null);
    const args = route.request().postDataJSON() ?? {}; state.calls.push(name);
    if (name === 'portal_access') return send({ is_platform_staff: true, platform_role: 'super_admin', owner_venues: [] });
    if (name === 'is_platform_staff') return send(true);
    if (name === 'portal_tenant_directory') return send([{ id: venue, name: 'Fixture Venue', slug: 'fixture', is_active: true }]);
    if (name === 'portal_ps_inventory') return send({ contract_version: 1, generated_at: date, online_window_seconds: 180, items: [] });
    if (name === 'portal_ps_devices') return send({ devices: [] });
    if (name === 'ps_firmware_list' && state.failRead) return send({ message: 'isolated fixture refresh failure' }, 503);
    if (name === 'ps_firmware_list') return send({ releases, installed: [{ version: '9.0.0', print_servers: 3, uploaded: true }, { version: '', print_servers: 1, uploaded: false }], complete: true, total: releases.length });
    if (name === 'ps_ota_admin_overview') return send({ ok: true, keys: [], releases: releases.map(r => ({ ...r, edition_id: r.lifecycle?.edition_id ?? null, edition_status: r.lifecycle?.edition_status ?? null, signed_at: r.lifecycle?.signed_at ?? null, key_id: r.lifecycle?.key_id ?? null, canary_confirmed_at: null })), groups: [{ id: 'fixture-lab-group', name: 'FIXTURE LAB (empty)', ring: 'lab', members: [] }, { id: 'fixture-canary-group', name: 'FIXTURE CANARY (empty)', ring: 'canary', members: [] }], devices: [], deployments: [], audit: [] });
    if (name === 'ps_ota_admin_deployments_page') return send({ ok: true, total: 1, items: state.history, limit: 25, offset: 0, aggregates: { target_by_status: { committed: 1 }, target_count: 1 } });
    if (name === 'ps_ota_admin_audit_page' || name === 'ps_ota_admin_targets_page') return send({ ok: true, total: 0, items: [], limit: 25, offset: 0, aggregates: {} });
    if (name === 'ps-firmware-admin') {
      if (args.action === 'begin') { state.upload = { ...makeRelease(100), sha256: 'b'.repeat(64), version: args.version }; return send({ ok: true, id: 'fixture-upload', bucket: 'fixture-only', path: 'fixture-only.zip', token: 'fixture-only' }); }
      if (args.action === 'finalize') return send({ ok: true, release: state.upload });
      if (args.action === 'delete') { state.writes++; return send({ ok: false, error: 'deployment_in_progress' }, 409); }
      report.errors.push(`Unexpected firmware action ${args.action}`); return route.abort();
    }
    if (name === 'ps-ota-admin') {
      if (args.action !== 'sign') { report.physicalDeployRequests++; report.errors.push(`Disallowed OTA action ${args.action}`); return route.abort(); }
      state.signCalls++;
      const r = releases.find(r => r.id === args.release_id);
      assert.deepEqual(args.confirmation, { sha256: r.sha256, version: r.version, model: r.model, arch: r.arch, revision: r.revision });
      if (state.signMode === 'changed') return send({ ok: false, error: 'release_changed' }, 409);
      r.lifecycle = lifecycle(0); r.lifecycle.rings.lab.enabled = false; r.lifecycle.rings.lab.available = false;
      return send({ ok: true, version: r.version, edition_id: r.lifecycle.edition_id, key_id: r.lifecycle.key_id });
    }
    if (name === 'ps_ota_edition_availability_set') {
      if (state.availabilityMode === 'blocked') return send({ ok: false, error: 'deployment_in_progress' });
      const r = releases.find(r => r.lifecycle?.edition_id === args.p_edition_id);
      assert.equal(args.p_expected_revision, r.lifecycle.revision);
      assert.ok(!Object.hasOwn(args, 'p_actor')); assert.ok(!Object.hasOwn(args, 'canary_confirmed_at'));
      state.writes++;
      r.lifecycle.revision++;
      for (const ring of ['lab', 'canary', 'general']) r.lifecycle.rings[ring].enabled = args.p_enabled_rings.includes(ring);
      if (args.p_retired) { r.lifecycle.retired_at = date; r.lifecycle.retired_by = uid; r.lifecycle.can_retire = false; }
      for (const ring of ['lab', 'canary', 'general']) r.lifecycle.rings[ring].available = !r.lifecycle.retired_at && r.lifecycle.rings[ring].enabled && r.lifecycle.rings[ring].eligible;
      r.lifecycle.configuration = 'explicit';
      return send({ ok: true });
    }
    report.errors.push(`Unexpected endpoint ${name}`); return route.abort();
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => report.errors.push(error.message));
  return { ctx, page, state };
}
async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow'); }
try {
  for (const width of [390, 1440]) for (const lang of ['en', 'es']) {
    const { ctx, page, state } = await setup(width, lang), suffix = `${lang}-${width}`;
    await page.goto(`${origin}/admin/print-servers/firmwares?lang=${lang}`);
    await expect(page.getByTestId('fw-row-fixture-release-0')).toBeVisible();
    await expect(page.getByTestId('fw-release-list').locator(':scope > li')).toHaveCount(25);
    await expect(page.getByTestId('fw-releases-pagination-range')).toContainText('28');
    await expect(page.locator('.fw-donut-total')).toHaveText('4'); // Never 3+3 from two revisions.
    await expect(page.getByTestId('fw-row-fixture-release-0')).not.toContainText(lang === 'es' ? 'Instalado en' : 'Installed on');
    await page.getByTestId('fw-releases-pagination-next').click();
    await expect(page.getByTestId('fw-release-list').locator(':scope > li')).toHaveCount(3);
    await page.getByTestId('fw-releases-pagination-prev').click();
    await page.getByTestId('fw-releases-status').selectOption('retired');
    await expect(page.getByTestId('fw-release-list').locator(':scope > li')).toHaveCount(1);
    await page.getByTestId('fw-releases-status').selectOption('');
    await expect(page.getByTestId('fw-unavailable-fixture-release-3')).toBeVisible();
    await expect(page.getByTestId('fw-sign-fixture-release-3')).toHaveCount(0);
    await expect(page.getByTestId('fw-toggle-fixture-release-4-canary')).toBeDisabled();
    await page.getByTestId('fw-sign-fixture-release-0').click();
    await expect(page.getByTestId('fw-confirm-sign')).toBeDisabled();
    await expect(page.getByTestId('fw-sign-dialog')).toContainText('a'.repeat(64));
    await expect(page.getByTestId('fw-sign-dialog')).toContainText('rpi4-2gb');
    await page.getByTestId('fw-sign-check').check();
    await page.getByTestId('fw-confirm-sign').click();
    await expect(page.getByTestId('fw-sign-error')).toBeVisible();
    await page.screenshot({ path: `${out}/confirmation-changed-${suffix}.png` });
    state.signMode = 'ok'; await page.getByTestId('fw-confirm-sign').click();
    await expect(page.getByTestId('fw-sign-dialog')).toHaveCount(0);
    await expect(page.getByTestId('fw-key-fixture-release-0')).toHaveText('fixture-key-public');
    await expect(page.getByTestId('fw-ring-fixture-release-0-lab')).toHaveAttribute('data-enabled', 'false');
    await expect(page.getByTestId('fw-toggle-fixture-release-0-general')).toBeDisabled();
    await expect(page.getByTestId('fw-canary-pending-fixture-release-0')).toBeVisible();
    await page.getByTestId('fw-row-fixture-release-0').screenshot({ path: `${out}/signed-general-blocked-${suffix}.png` });
    await page.getByTestId('fw-toggle-fixture-release-1-canary').click();
    await page.getByTestId('fw-confirm-availability').click();
    await expect(page.getByTestId('fw-ring-fixture-release-1-canary')).toHaveAttribute('data-enabled', 'true');
    await noOverflow(page);
    await page.getByTestId('ps-tab-updates').click();
    await expect(page.getByTestId('updates-page')).toBeVisible();
    await expect(page.locator('[data-testid^="ota-sign-"]')).toHaveCount(0);
    await page.getByTestId('ota-deploy-group').selectOption('fixture-canary-group');
    await expect(page.getByTestId('ota-deploy-edition').locator('option[value="fixture-edition-1"]')).toHaveCount(1);
    await page.getByTestId('ota-deploy-edition').selectOption('fixture-edition-1');
    await page.getByTestId('ota-manage-firmware-fixture-release-1').click();
    await expect(page).toHaveURL(/edition=fixture-edition-1/);
    await expect(page.getByTestId('fw-exact-edition')).toBeVisible();
    const historyBefore = JSON.stringify(state.history);
    await page.getByTestId('fw-retire-fixture-release-1').click();
    await page.getByTestId('fw-confirm-availability').click();
    await expect(page.getByTestId('fw-row-fixture-release-1')).toHaveAttribute('data-status', 'retired');
    await page.getByTestId('ps-tab-updates').click();
    await page.getByTestId('ota-deploy-group').selectOption('fixture-canary-group');
    await expect(page.getByTestId('ota-deploy-edition').locator('option[value="fixture-edition-1"]')).toHaveCount(0);
    await expect(page.getByTestId('ota-deploy-submit')).toBeDisabled();
    await noOverflow(page);
    assert.equal(JSON.stringify(state.history), historyBefore, 'Retirement preserves fixture history exactly');
    await page.getByTestId('ota-deployment-firmware-fixture-history').click();
    await expect(page).toHaveURL(/edition=fixture-edition-1/);
    await expect(page.getByTestId('fw-row-fixture-release-1')).toHaveAttribute('data-status', 'retired');
    await expect(page.getByTestId('fw-exact-edition')).toBeVisible();
    await noOverflow(page);
    await page.getByTestId('fw-row-fixture-release-1').screenshot({ path: `${out}/retired-history-${suffix}.png` });
    // Exact deep link outside first page, not a version match or a hidden filtered list row.
    await page.goto(`${origin}/admin/print-servers/firmwares?edition=fixture-edition-27&lang=${lang}`);
    await expect(page.getByTestId('fw-row-fixture-release-27')).toBeVisible();
    await page.goto(`${origin}/admin/print-servers/firmwares?edition=nonexistent&release=fixture-release-2&lang=${lang}`);
    await expect(page.getByTestId('fw-detail-missing')).toBeVisible();
    await expect(page.getByTestId('fw-exact-edition')).toHaveCount(0);
    // Retirement's active-operation rejection must not claim a destructive deletion.
    await page.goto(`${origin}/admin/print-servers/firmwares?release=fixture-release-5&lang=${lang}`);
    state.availabilityMode = 'blocked';
    await page.getByTestId('fw-retire-fixture-release-5').click();
    await page.getByTestId('fw-confirm-availability').click();
    await expect(page.getByTestId('fw-availability-error')).toContainText(lang === 'es' ? 'bloquea este cambio' : 'blocks this change');
    await expect(page.getByTestId('fw-availability-error')).not.toContainText(lang === 'es' ? 'eliminar' : 'delete');
    await page.keyboard.press('Escape'); state.availabilityMode = 'ok';
    // Upload hash mismatch. Storage and finalize are doubles; this is a browser comparison only.
    await page.goto(`${origin}/admin/print-servers/firmwares?lang=${lang}`);
    await page.getByTestId('fw-file').setInputFiles({ name: 'fixture-pe442.zip', mimeType: 'application/zip', buffer: Buffer.from('ISOLATED UI FIXTURE') });
    await page.getByTestId('fw-version').fill('9.9.99');
    await page.getByTestId('fw-submit').click();
    await expect(page.getByTestId('fw-result')).toHaveAttribute('data-ok', 'false');
    await expect(page.getByTestId('fw-local-sha')).toBeVisible();
    assert.notEqual(await page.getByTestId('fw-local-sha').textContent(), await page.getByTestId('fw-server-sha').textContent());
    await page.getByTestId('fw-result-detail').screenshot({ path: `${out}/hash-mismatch-${suffix}.png` });
    // Failed refetch must hide cached lifecycle actions until a successful retry.
    state.failRead = true;
    await page.locator('button').filter({ hasText: lang === 'es' ? /^Actualizar$/ : /^Refresh$/ }).click();
    await expect(page.getByTestId('firmwares-page')).toHaveCount(0);
    await expect(page.locator('[data-testid^=fw-retire-],[data-testid^=fw-toggle-],[data-testid^=fw-sign-]')).toHaveCount(0);
    assert.ok(!state.calls.includes('portal_ps_inventory'), 'Firmware administration does not depend on unrelated inventory reads');
    assert.equal(state.signCalls, 2); assert.equal(state.writes, 2);
    assert.equal(state.history[0].edition_id, 'fixture-edition-1');
    report.checks.push({ width, lang, signature: 'confirmation snapshot, changed-release rejection, simulated success, no automatic ring enablement', general: 'disabled with pending canary explanation', availability: 'enable Canary, reflect selector, retire, exclude selector, retain exact history link', counts: '28 total, pagination 25/3, retirement filter, 4 fleet devices instead of duplicated revision counts', hash: 'local/server mismatch visible', links: 'exact retired and off-page edition; conflicting release query cannot substitute edition', layout: 'no page overflow', failures: 'blocked retirement uses lifecycle message; failed refetch removes cached mutation controls', network: 'all Supabase requests intercepted; no deploy request' });
    await ctx.close();
  }
  assert.deepEqual(report.errors, []); assert.equal(report.physicalDeployRequests, 0);
  await writeFile(`${out}/checks.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
