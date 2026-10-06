// PE-385 — capturas por secciones de la pestaña Actualizaciones publicada (EN y ES). Sin secretos.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const origin = 'https://playerp.dev.bmore.app';
const accounts = JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`, 'utf8'));
const out = process.env.LIVE_OUTPUT_DIR;
const b = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); page.setDefaultTimeout(30000);
await page.goto(origin + '/auth/login?lang=en');
await page.getByLabel('Email address', { exact: true }).fill(accounts.staff_activo.email);
await page.getByLabel('Password', { exact: true }).fill(accounts.staff_activo.password);
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL(u => !u.pathname.startsWith('/auth/'));
for (const lang of ['en', 'es']) {
  await page.goto(`${origin}/admin/print-servers/updates?lang=${lang}`); await page.getByTestId('updates-page').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/updates-${lang}-arriba.png` });
  const sections = page.locator('[data-testid="updates-page"] section');
  const n = await sections.count();
  for (let i = 0; i < n; i++) {
    const s = sections.nth(i); const id = await s.getAttribute('aria-labelledby');
    if (id && /devices|audit/.test(id)) await s.screenshot({ path: `${out}/updates-${lang}-${id.replace('ota-', '').replace('-title', '')}.png` });
  }
}
console.log('ok'); await b.close();
