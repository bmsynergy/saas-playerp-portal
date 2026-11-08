// Full final PNG, synthetic credentials only. Run with Vite on COREDEVA test port 18799.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
const out = 'docs/evidence/pe607';
await mkdir(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const fixtures = [
  ['canonical', 'PlayERP-Setup-TEST607A'],
  ['ascii32', 'W'.repeat(32)],
  ['escaped32', '\\;,:"'.repeat(6) + '\\;'],
  ['utf8-2byte', 'é'.repeat(16)],
  ['utf8-3byte', '中'.repeat(10)],
];
const results = [];
try {
  const p = await b.newPage();
  await p.route(url => !url.href.startsWith('http://127.0.0.1:18799'), r => r.abort());
  await p.goto('http://127.0.0.1:18799');
  for (const locale of ['en', 'es']) for (const [name, ssid] of fixtures) {
    const input = { deviceId: 'fixture', serial: 'PS-TEST607A', ssid, password: '0123456789', appliedAt: '2026-01-01T00:00:00Z' };
    const result = await p.evaluate(async ({ input, locale }) => {
      const m = await import('/src/lib/psLabel.ts');
      const texts = [], rectangles = [], original = CanvasRenderingContext2D.prototype.fillText, rect = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillText = function(value, x, y) {
        const metrics = this.measureText(value);
        texts.push({ value, x, y, font: this.font, width: metrics.width, left: x - metrics.actualBoundingBoxLeft, right: x + metrics.actualBoundingBoxRight, top: y - metrics.actualBoundingBoxAscent, bottom: y + metrics.actualBoundingBoxDescent });
        return original.call(this, value, x, y);
      };
      CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) { if (this.fillStyle === '#000000') rectangles.push({ x, y, w, h }); return rect.call(this, x, y, w, h); };
      let blob;
      try { blob = await m.generateLabelPng(input, locale); }
      finally { CanvasRenderingContext2D.prototype.fillText = original; CanvasRenderingContext2D.prototype.fillRect = rect; }
      const image = await createImageBitmap(blob), canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, 400, 240); image.close();
      const scaled = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return { texts, rectangles, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), scaled: Array.from(new Uint8Array(await scaled.arrayBuffer())) };
    }, { input, locale });
    const bytes = Buffer.from(result.bytes), png = PNG.sync.read(bytes), scaled = PNG.sync.read(Buffer.from(result.scaled));
    assert.equal(png.width, 590); assert.equal(png.height, 354);
    let at = 8, phys = [];
    while (at < bytes.length) { const n = bytes.readUInt32BE(at); if (bytes.toString('ascii', at + 4, at + 8) === 'pHYs') phys.push([bytes.readUInt32BE(at + 8), bytes.readUInt32BE(at + 12), bytes[at + 16]]); at += 12 + n; }
    assert.deepEqual(phys, [[11811, 11811, 1]]);
    const esc = s => s.replace(/([\\;,:"])/g, '\\$1'), payload = `WIFI:T:WPA;S:${esc(ssid)};P:0123456789;;`;
    assert.equal(jsQR(new Uint8ClampedArray(png.data), 590, 354)?.data, payload, `${locale}/${name} 300 dpi`);
    assert.equal(jsQR(new Uint8ClampedArray(scaled.data), 400, 240)?.data, payload, `${locale}/${name} simulated 203 dpi`);
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' }), scale = qr.version <= 4 ? 6 : 5, size = (qr.modules.size + 8) * scale;
    // The first drawn QR module is the top-left finder corner; validate every module and quiet-zone pixel against an independently encoded matrix.
    const first = result.rectangles.find(r => r.w === scale && r.h === scale);
    assert(first, 'QR drawn as integer, unscaled modules');
    const x0 = first.x - 4 * scale, y0 = first.y - 4 * scale;
    assert(x0 >= 18 && y0 >= 18 && x0 + size <= 572 && y0 + size <= 336);
    for (let row = 0; row < qr.modules.size + 8; row++) for (let col = 0; col < qr.modules.size + 8; col++) {
      const black = row >= 4 && col >= 4 && row < qr.modules.size + 4 && col < qr.modules.size + 4 && qr.modules.get(row - 4, col - 4);
      for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) assert.equal(png.data[((y0 + row * scale + y) * 590 + x0 + col * scale + x) * 4], black ? 0 : 255, 'module / uncontaminated quiet zone');
    }
    const text = result.texts;
    assert(text.every(t => t.left >= 18 && t.right <= 572 && t.top >= 18 && t.bottom <= 336), `all glyph bounds within margin: ${JSON.stringify(text.filter(t => t.left < 18 || t.right > 572 || t.top < 18 || t.bottom > 336))}`);
    const fontSize = t => Number(t.font.match(/([\d.]+)px/)[1]);
    const ssidText = text.filter(t => t.x < x0 && t.top > 50 && fontSize(t) >= 30 && t.value !== input.password);
    assert.equal(ssidText.map(t => t.value).join(''), ssid, 'SSID intact at >=30px');
    assert(text.some(t => t.value === input.password && fontSize(t) >= 44), 'password >=44px');
    assert(text.some(t => t.value === input.serial && t.bottom < 60));
    assert(text.some(t => t.value === 'PlayERP' && t.bottom < 60));
    const url = text.find(t => t.value === 'http://10.77.0.1');
    assert(url && url.top > 250);
    assert(text.filter(t => t.top > 250 && t !== url).every(t => fontSize(t) < fontSize(url)));
    assert(text.some(t => /90/.test(t.value) && (locale === 'en' ? /appears/.test(t.value) : /aparece/.test(t.value))));
    assert(!text.some(t => /maintenance|mantenimiento|pse_|pst_|ABCD234567/.test(t.value)));
    for (let y = 0; y < 354; y++) for (let x = 0; x < 590; x++) {
      const i = (y * 590 + x) * 4, v = png.data[i];
      assert((v === 0 || v === 255) && v === png.data[i + 1] && v === png.data[i + 2] && png.data[i + 3] === 255);
      if (x < 18 || x >= 572 || y < 18 || y >= 336) assert.equal(v, 255, 'safe outer margin');
    }
    const file = `label-${locale}-${name}.png`;
    await writeFile(`${out}/${file}`, bytes);
    await writeFile(`${out}/label-${locale}-${name}-203-simulation.png`, Buffer.from(result.scaled));
    const entry = { file, locale, ssidBytes: Buffer.byteLength(ssid), width: 590, height: 354, pHYs: phys[0], decoded300: payload, decoded203: payload, qrVersion: qr.version, errorCorrection: 'M', integerScale: scale, quietZone: 4, quietZonePixelCheck: true, safeMargin: 18, texts: text };
    results.push(entry);
    console.log(`PASS ${locale}/${name}: 590x354 pHYs=11811; QR M v${qr.version} ${scale}px/module quiet=4; exact decode 300dpi + simulated203dpi; full SSID, >=30px/44px, margin18.`);
  }
  const blocked = await p.evaluate(async () => {
    const m = await import('/src/lib/psLabel.ts'), original = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function() { return { width: 9999 }; };
    try { await m.generateLabelPng({ deviceId: 'fixture', serial: 'PS-TEST607A', ssid: 'PlayERP-Setup-TEST607A', password: '0123456789', appliedAt: '2026-01-01T00:00:00Z' }); return false; }
    catch (e) { return e.message === 'label_does_not_fit'; }
    finally { CanvasRenderingContext2D.prototype.measureText = original; }
  });
  assert(blocked, 'unexpected font metrics block instead of clipping');
  const source = await readFile('src/lib/psLabel.ts', 'utf8');
  assert(source.includes('@page{size:50mm 30mm;margin:0}'));
  await writeFile(`${out}/label-report.json`, JSON.stringify({ pass: true, physicalCamera: 'Pending Beny: digital decode and 203dpi resampling do not prove thermal scanning', overflowBlocks: blocked, results }, null, 2) + '\n');
  console.log('PASS overflow label_does_not_fit; nominal CSS 50x30mm. 10 synthetic PNGs; physical print/camera still pending Beny.');
} finally { await b.close(); }
