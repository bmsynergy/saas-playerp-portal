// PE-384 — DEV acceptance for the Firmwares tab on the PUBLISHED portal with real DEV accounts.
// Uploads one ZIP through the real screen (browser -> signed upload URL -> server hash), checks the
// server hash against the local file, takes EN/ES screenshots at 390 px and checks that an owner
// is denied. Writes no password, token or signed URL.
//   PORTAL_DEV_FIXTURES=… FW_ZIP=/path/file.zip node tests/firmwares-live.mjs
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const origin = process.env.PORTAL_TEST_ORIGIN ?? 'https://playerp.dev.bmore.app';
const accounts = JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`, 'utf8'));
const zip = process.env.FW_ZIP; assert(zip, 'FW_ZIP required');
const out = process.env.LIVE_OUTPUT_DIR ?? 'docs/evidence/pe384-firmwares'; await mkdir(out, { recursive: true });
const localSha = createHash('sha256').update(await readFile(zip)).digest('hex');
const report = { origin, startedAt: new Date().toISOString(), localSha, checks: [], screenshots: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
async function login(page, profile) {
  await page.goto(origin + '/auth/login?lang=en');
  await page.getByLabel('Email address', { exact: true }).fill(accounts[profile].email);
  await page.getByLabel('Password', { exact: true }).fill(accounts[profile].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth/'));
}
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await ctx.newPage(); page.setDefaultTimeout(30_000);
  await login(page, 'staff_activo');
  await page.goto(origin + '/admin/print-servers/firmwares');
  await page.getByTestId('firmwares-page').waitFor();
  await page.getByTestId('fw-file').setInputFiles(zip);
  await page.getByTestId('fw-version').fill(process.env.FW_VERSION ?? '0.0.1');
  await page.getByTestId('fw-revision').fill(process.env.FW_REVISION ?? 'pe384-ui');
  await page.getByTestId('fw-notes').fill(process.env.FW_NOTES ?? 'PE-384 test upload from the browser (not a real firmware).');
  await page.getByTestId('fw-submit').click();
  await page.locator('[data-testid="fw-result"][data-ok]').waitFor();
  const ok = await page.getByTestId('fw-result').getAttribute('data-ok');
  const serverSha = (await page.getByTestId('fw-server-sha').innerText()).trim();
  report.checks.push({ case: 'browser upload', ok, serverSha, localSha, equal: serverSha === localSha });
  assert.equal(serverSha, localSha);
  await page.getByTestId('fw-result-detail').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/firmwares-en-390-upload.png`, fullPage: true }); report.screenshots.push('firmwares-en-390-upload.png');
  await page.goto(origin + '/admin/print-servers/firmwares?lang=es');
  await page.getByTestId('firmwares-page').waitFor();
  await page.getByText('Cargado frente a instalado').waitFor();
  await page.screenshot({ path: `${out}/firmwares-es-390.png`, fullPage: true }); report.screenshots.push('firmwares-es-390.png');
  await page.goto(origin + '/admin/print-servers/firmwares?lang=en');
  await page.getByText('Loaded versus installed').waitFor();
  await page.screenshot({ path: `${out}/firmwares-en-390.png`, fullPage: true }); report.screenshots.push('firmwares-en-390.png');
  await ctx.close();
  const octx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const opage = await octx.newPage(); opage.setDefaultTimeout(30_000);
  await login(opage, 'owner_varios');
  await opage.goto(origin + '/admin/print-servers/firmwares');
  await opage.waitForTimeout(3000);
  const ownerSees = await opage.getByTestId('fw-form').count();
  report.checks.push({ case: 'owner opens /admin/print-servers/firmwares', formVisible: ownerSees > 0 });
  assert.equal(ownerSees, 0);
  await opage.screenshot({ path: `${out}/firmwares-owner-denied-390.png`, fullPage: true }); report.screenshots.push('firmwares-owner-denied-390.png');
  await octx.close();
  console.log(JSON.stringify(report, null, 1));
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 1));
} finally { await browser.close(); }
