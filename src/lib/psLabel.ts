import QRCode from 'qrcode';
import { confirmedAt, validRecoveryWifi, wifiQrPayload, type DeviceSheet } from './psDevice';

export type LabelData = { deviceId: string; serial: string; ssid: string; password: string; appliedAt: string | null; confirmation?: 'stock_rpc' };
export const LABEL_WIDTH = 590;
export const LABEL_HEIGHT = 354;
export const LABEL_PPM = 11811; // 300 dpi; raster rounds to 49.95 × 29.97 mm.
export const LABEL_MARGIN = 18; // 1.524 mm at 300 dpi, at least 1.5 mm on each edge.
export const LABEL_STEPS = [
  '1 Power off/on',
  '2 Join Wi-Fi within 90 s',
  '3 Open in browser:',
  'http://10.77.0.1',
] as const;

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
export async function generateLabelPng(data: LabelData): Promise<Blob> {
  if (!validLabel(data)) throw new Error('label_unavailable');
  const canvas = document.createElement('canvas'); canvas.width = LABEL_WIDTH; canvas.height = LABEL_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('label_unavailable');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT); ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  const left = LABEL_MARGIN, width = LABEL_WIDTH - left * 2;
  function line(value: string, y: number, font: string, x = left, max = width) {
    ctx!.font = font;
    // No shrinking, clipping or ellipses: unexpected font metrics block the export.
    if (ctx!.measureText(value).width > max) throw new Error('label_does_not_fit');
    ctx!.fillText(value, x, y);
  }
  // Entire left half holds text; the right half is reserved for an undistorted QR.
  const textWidth = LABEL_WIDTH / 2 - left - 12;
  line('PlayERP', 43, 'bold 28px Arial, sans-serif', left, textWidth);
  line(data.serial, 74, 'bold 24px monospace', left, textWidth);
  line('Wi-Fi (SSID)', 108, '18px Arial, sans-serif', left, textWidth);
  ctx.font = 'bold 19px monospace';
  const ssidLines: string[] = []; let current = '';
  for (const char of data.ssid) {
    if (ctx.measureText(current + char).width > textWidth) { ssidLines.push(current); current = ''; }
    current += char;
  }
  ssidLines.push(current);
  if (ssidLines.length > 2) throw new Error('label_does_not_fit');
  ssidLines.forEach((value, i) => line(value, 134 + i * 24, 'bold 19px monospace', left, textWidth));
  line('Password', 190, '18px Arial, sans-serif', left, textWidth);
  line(data.password, 219, 'bold 25px monospace', left, textWidth);
  LABEL_STEPS.forEach((value, i) => line(value, 253 + i * 24, 'bold 17px Arial, sans-serif', left, textWidth));
  const qr = QRCode.create(wifiQrPayload(data.ssid, data.password), { errorCorrectionLevel: 'M' });
  const quiet = 4, qrArea = LABEL_WIDTH / 2 - LABEL_MARGIN, qrLeft = LABEL_WIDTH / 2;
  const scale = Math.floor(qrArea / (qr.modules.size + quiet * 2));
  if (scale < 3) throw new Error('label_does_not_fit');
  const qrSize = (qr.modules.size + quiet * 2) * scale;
  const qrX = qrLeft + Math.floor((qrArea - qrSize) / 2);
  const qrY = Math.floor((LABEL_HEIGHT - qrSize) / 2);
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < qr.modules.size; row++) {
    for (let col = 0; col < qr.modules.size; col++) {
      if (qr.modules.get(row, col)) ctx.fillRect(qrX + (col + quiet) * scale, qrY + (row + quiet) * scale, scale, scale);
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
