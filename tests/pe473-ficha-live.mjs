// PE-473 — comprobación de SOLO LECTURA de la ficha publicada del PS real (78d05113 / aparato 59a41440) en EN y ES,
// y de la vista owner. Bloquea cualquier POST a ps-ota-admin: abrir y cancelar un diálogo no envía nada. Sin secretos.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const origin = 'https://playerp.dev.bmore.app';
const device = '59a41440-8536-4045-aed1-3fcc5adaf193';
const accounts = JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`, 'utf8'));
const out = process.env.LIVE_OUTPUT_DIR;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const report = { origin, device, readOnly: true, mocks: false, startedAt: new Date().toISOString(), blockedWrites: [], views: [] };
async function session(profile) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.route('**/functions/v1/ps-ota-admin', r => { if (r.request().method() === 'POST') { report.blockedWrites.push(r.request().postData()); return r.abort(); } return r.continue(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  await page.goto(origin + '/auth/login?lang=en');
  await page.getByLabel('Email address', { exact: true }).fill(accounts[profile].email);
  await page.getByLabel('Password', { exact: true }).fill(accounts[profile].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/auth/'));
  return { ctx, page };
}
const S = {
  es: { pending: 'Validación Canary pendiente', upToDateNot: 'al día', channel: 'Canal', lab: 'Laboratorio', change: 'Cambiar canal', validate: 'Validar en Canary', req: 'Requisitos para General', link: 'Habilitar General en Firmwares', confirm: 'Cambiar el canal no instala nada', updater: 'no soporta validación', cancel: 'Cancelar' },
  en: { pending: 'Canary validation pending', upToDateNot: 'up to date', channel: 'Channel', lab: 'Laboratory', change: 'Change channel', validate: 'Validate in Canary', req: 'Requirements for General', link: 'Enable General in Firmwares', confirm: 'does not install anything', updater: 'does not support validation', cancel: 'Cancel' },
};
const { ctx, page } = await session('staff_activo');
for (const lang of ['es', 'en']) {
  const s = S[lang];
  await page.goto(`${origin}/admin/print-servers/devices/${device}?lang=${lang}`);
  await page.getByText(s.pending, { exact: false }).first().waitFor();
  await page.waitForTimeout(1500);
  const text = await page.locator('body').innerText();
  const vbtn = page.getByRole('button', { name: s.validate, exact: true });
  const cbtn = page.getByRole('button', { name: s.change, exact: true }).first();
  const link = page.getByRole('link', { name: s.link });
  const checks = {
    pending: text.includes(s.pending),
    channel_lab: text.includes(s.channel) && text.includes(s.lab) && text.includes('lab ps'),
    change_button: await cbtn.count() > 0,
    validate_button_is_own_button: await vbtn.count() === 1 && (await vbtn.evaluate(e => e.tagName)) === 'BUTTON',
    validate_disabled_with_reason: await vbtn.isDisabled(),
    updater_warning: text.includes(s.updater),
    requirements: text.includes(s.req),
    firmwares_link_href: await link.count() > 0 ? await link.first().getAttribute('href') : null,
    edition_sha: text.includes('e0784589'),
  };
  await page.screenshot({ path: `${out}/ficha-${lang}.png`, fullPage: true });
  // Confirmación del cambio de canal: se abre, se fotografía y se CANCELA (no se envía nada).
  await cbtn.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  checks.change_confirm_text = (await dialog.innerText()).includes(s.confirm);
  await dialog.screenshot({ path: `${out}/cambiar-canal-${lang}.png` });
  await dialog.getByRole('button', { name: s.cancel, exact: true }).click();
  report.views.push({ lang, url: `/admin/print-servers/devices/${device}?lang=${lang}`, checks, pass: Object.values(checks).every(v => v === true || v === '/admin/print-servers/firmwares') });
}
await ctx.close();
// Vista owner: sin controles internos.
const o = await session('owner_varios');
await o.page.goto(`${origin}/?lang=es`); await o.page.waitForTimeout(4000);
const otext = await o.page.locator('body').innerText();
const forbidden = ['Cambiar canal', 'Validar en Canary', 'Validación Canary', 'Requisitos para General', 'Edición a instalar', 'Change channel', 'Validate in Canary'];
report.owner = { url: '/?lang=es', found: forbidden.filter(f => otext.includes(f)), pass: forbidden.every(f => !otext.includes(f)) };
await o.page.screenshot({ path: `${out}/owner-es.png`, fullPage: true });
await o.ctx.close();
report.finishedAt = new Date().toISOString();
report.pass = report.views.every(v => v.pass) && report.owner.pass && report.blockedWrites.length === 0;
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1)); await b.close();
