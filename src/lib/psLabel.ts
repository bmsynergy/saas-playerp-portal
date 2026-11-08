import QRCode from 'qrcode';
import { confirmedAt, validRecoveryWifi, wifiQrPayload, type DeviceSheet } from './psDevice';

export type LabelData = { deviceId: string; serial: string; ssid: string; password: string; appliedAt: string | null; confirmation?: 'stock_rpc' };
export const LABEL_WIDTH = 590;
export const LABEL_HEIGHT = 354;
export const LABEL_PPM = 11800; // 590 × 354 pixels are exactly 50 × 30 mm.
export const LABEL_MARGIN = 20;
export const LABEL_STEPS = {
  en: { wifi: 'Wi-Fi', password: 'Password', connect: 'Connect to Wi-Fi', open: 'Open in browser' },
  es: { wifi: 'Wi-Fi', password: 'Clave', connect: 'Conéctate al Wi-Fi', open: 'Abre en el navegador' },
} as const;

function validLabel(d: LabelData): boolean {
  return !/pse_|pst_|PRIVATE\s+KEY/i.test(d.ssid + d.password) && !!d.deviceId && /^PS-[A-Z0-9]{8}$/.test(d.serial) && validRecoveryWifi(d.ssid, d.password) && (d.confirmation === 'stock_rpc' || !!confirmedAt(d.appliedAt));
}
export function labelDataFromSheet(sheet: DeviceSheet): LabelData | null {
  const d = sheet.device, w = sheet.appliedWifi;
  if (!sheet.credentialAccess || !d || !w || d.status !== 'assigned') return null;
  const label = { deviceId: d.id, serial: d.serial, ssid: w.ssid, password: w.psk, appliedAt: w.applied_at };
  return validLabel(label) ? label : null;
}
// In-memory comparison only. Never persist or log this value: it contains the human Wi-Fi secret.
export function labelFingerprint(data: LabelData): string {
  return JSON.stringify([data.deviceId, data.serial, data.ssid, data.password, data.appliedAt, data.confirmation]);
}
export function labelFilename(data: LabelData): string {
  if (!validLabel(data)) throw new Error('label_unavailable');
  return `${data.serial}-50x30mm.png`;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function withPhysicalResolution(png: Uint8Array): Uint8Array {
  if (png.length < 33 || ![137,80,78,71,13,10,26,10].every((n,i) => png[i] === n)) throw new Error('invalid_png');
  const type = new TextEncoder().encode('pHYs');
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9); chunk.set(type, 4);
  view.setUint32(8, LABEL_PPM); view.setUint32(12, LABEL_PPM); chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let offset = 8, inserted = false, ended = false;
  while (offset + 12 <= png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
    const end = offset + length + 12;
    if (end > png.length) throw new Error('invalid_png');
    const name = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (name !== 'pHYs') parts.push(png.subarray(offset, end));
    if (name === 'IHDR') { parts.push(chunk); inserted = true; }
    offset = end;
    if (name === 'IEND') { ended = true; break; }
  }
  if (!inserted || !ended || offset !== png.length) throw new Error('invalid_png');
  const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0; for (const p of parts) { result.set(p, at); at += p.length; }
  return result;
}

/** A single raster serves preview, download and print. The QR contains only applied Wi-Fi. */
export async function generateLabelPng(data: LabelData, language: 'en' | 'es' = 'en'): Promise<Blob> {
  if (!validLabel(data)) throw new Error('label_unavailable');
  const canvas = document.createElement('canvas'); canvas.width = LABEL_WIDTH; canvas.height = LABEL_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('label_unavailable');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT); ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  const left = LABEL_MARGIN, width = LABEL_WIDTH - left * 2;
  function line(value: string, y: number, font: string, x = left, max = width) {
    ctx!.font = font;
    // Reject text that would cross its allotted column or the printable margin.
    const metrics = ctx!.measureText(value);
    if (metrics.width > max || x + metrics.actualBoundingBoxRight > LABEL_WIDTH - LABEL_MARGIN) throw new Error('label_does_not_fit');
    ctx!.fillText(value, x, y);
  }
  const copy = LABEL_STEPS[language];
  line('PlayERP', 43, 'bold 26px Arial, sans-serif', left, 190);
  ctx.font = 'bold 22px monospace';
  const serialWidth = ctx.measureText(data.serial).width;
  line(data.serial, 43, 'bold 22px monospace', LABEL_WIDTH - left - serialWidth, 230);

  line(copy.wifi, 68, '16px Arial, sans-serif');
  let ssidFont = 38;
  for (; ssidFont >= 24; ssidFont--) {
    ctx.font = `bold ${ssidFont}px monospace`;
    if (ctx.measureText(data.ssid).width <= width) break;
  }
  if (ssidFont < 24) throw new Error('label_does_not_fit');
  line(data.ssid, 110, `bold ${ssidFont}px monospace`);

  const qr = QRCode.create(wifiQrPayload(data.ssid, data.password), { errorCorrectionLevel: 'M' });
  const quiet = 4;
  const scale = qr.modules.size * 5 <= width * 0.3 ? 5 : 4;
  const blackSize = qr.modules.size * scale;
  const blackX = LABEL_WIDTH - LABEL_MARGIN - blackSize;
  const blackY = LABEL_HEIGHT - LABEL_MARGIN - blackSize;
  const quietX = blackX - quiet * scale;
  const quietY = blackY - quiet * scale;
  if (quietX < left || quietY < left) throw new Error('label_does_not_fit');
  // Text stays clear of the four-module quiet zone, which reaches the right/bottom edge.
  const textWidth = quietX - left - 12;
  if (textWidth <= 0) throw new Error('label_does_not_fit');
  line(copy.password, 146, '16px Arial, sans-serif', left, textWidth);
  line(data.password, 205, 'bold 52px monospace', left, textWidth);
  line(copy.connect, 256, '16px Arial, sans-serif', left, textWidth);
  line(copy.open, 278, '16px Arial, sans-serif', left, textWidth);
  line('http://10.77.0.1', 329, 'bold 26px Arial, sans-serif', left, textWidth);
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < qr.modules.size; row++) {
    for (let col = 0; col < qr.modules.size; col++) {
      if (qr.modules.get(row, col)) ctx.fillRect(blackX + col * scale, blackY + row * scale, scale, scale);
    }
  }
  // Thermal label: only opaque pure black/white, no antialiasing gray or color pixels.
  const pixels = ctx.getImageData(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = pixels.data[i] < 160 ? 0 : 255;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('label_unavailable')), 'image/png'));
  return new Blob([withPhysicalResolution(new Uint8Array(await png.arrayBuffer())) as Uint8Array<ArrayBuffer>], { type: 'image/png' });
}

export async function printLabel(blob: Blob, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  const url = URL.createObjectURL(blob), frame = document.createElement('iframe');
  frame.title = 'Print Server label'; frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const cleanup = () => { URL.revokeObjectURL(url); frame.remove(); signal?.removeEventListener('abort', cleanup); };
  signal?.addEventListener('abort', cleanup, { once: true });
  try {
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc || !win) throw new Error('label_unavailable');
    const style = doc.createElement('style');
    style.textContent = '@page{size:50mm 30mm;margin:0}html,body{margin:0;padding:0;width:50mm;height:30mm}img{display:block;width:50mm;height:30mm}';
    doc.head.appendChild(style); doc.title = 'Print Server label';
    const img = doc.createElement('img'); img.alt = 'Print Server recovery Wi-Fi label';
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('label_unavailable')); img.src = url; doc.body.appendChild(img); });
    if (signal?.aborted) { cleanup(); return; }
    win.addEventListener('afterprint', cleanup, { once: true });
    win.focus(); win.print();
    // Browsers without afterprint still release the in-memory secret image.
    window.setTimeout(cleanup, 120_000);
  } catch (error) { cleanup(); throw error; }
}
