// Local component regression: nested destination, page jumps and size reset.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, executablePath: '/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('http://127.0.0.1:18791/tests/fixtures/pagination.html');
  const atStart = async text => {
    await expect(page.locator('section > ol:not([data-pagination-list]) > li').first()).toHaveText(text);
    const top = await page.locator('[data-pagination-list="nested"]').evaluate(el => el.getBoundingClientRect().top);
    assert(Math.abs(top - 88) <= 2, `nested list begins at ${top}, expected 88`);
  };
  await page.getByTestId('nested-pagination-next').click(); await atStart('Row 26');
  await page.getByTestId('nested-pagination-prev').click(); await atStart('Row 1');
  await page.getByTestId('nested-pagination-input').fill('4');
  await page.getByTestId('nested-pagination-go').click(); await atStart('Row 76');
  await page.getByTestId('nested-pagination-size').selectOption('50'); await atStart('Row 1');
  await expect(page.locator('section > ol:not([data-pagination-list]) > li')).toHaveCount(50);
  await page.getByTestId('nested-pagination-input').fill('99');
  await page.getByTestId('nested-pagination-go').click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page.locator('section > ol:not([data-pagination-list]) > li').first()).toHaveText('Row 1');
  await page.getByTestId('nested-pagination-input').fill('2');
  await page.getByTestId('nested-pagination-input').press('Enter'); await atStart('Row 51');
  const picker = page.locator('[data-pagination-list="picker"]');
  await picker.evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert(await picker.evaluate(el => el.scrollTop) > 500);
  await page.getByTestId('picker-pagination-next').click();
  await expect(picker.locator('li').first()).toHaveText('Device 26');
  assert.equal(await picker.evaluate(el => el.scrollTop), 0);
  assert(Math.abs(await picker.evaluate(el => el.getBoundingClientRect().top) - 88) <= 2);
  console.log('PASS: nested list start, Next, Previous, Go, Enter, size reset to page 1 and invalid jump.');
} finally { await browser.close(); }
