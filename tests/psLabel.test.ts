import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { projectDeviceSheet, wifiQrPayload } from '../src/lib/psDevice';
import { labelDataFromSheet, labelFilename, labelFingerprint, LABEL_WIDTH, LABEL_HEIGHT, LABEL_MARGIN, LABEL_PPM } from '../src/lib/psLabel';
const at = '2026-01-01T00:00:00Z';
const raw = () => ({ok:true, credentials_version:1, can_read_credentials:true, can_manage_credentials:true,
  device:{id:'fixture',serial:'PS-XXXXXXXX',status:'assigned',legacy:false},
  wifi:{ssid:'W'.repeat(28)+';:"\\',psk:'0123456789',admin_code:'ABCD234567',wifi_applied_at:at,admin_code_applied_at:at},
  rotations:[], cert:{}, can_manage:true, is_platform_admin:true});

describe('PE-411 applied-only credentials and label boundary', () => {
  it('permits only explicit server authorization and contract; strips tokens and pending fields', () => {
    const r = raw();
    const result = projectDeviceSheet({...r, technical_token:'DO_NOT_COPY', pending_wifi_psk:'FUTURE', wifi:{...r.wifi,pending_admin_code:'FUTURE',technical_token:'DO_NOT_COPY'}});
    expect(result.appliedWifi?.psk).toBe('0123456789');
    expect(result.appliedAdminCode?.code).toBe('ABCD234567');
    expect(JSON.stringify(result)).not.toMatch(/DO_NOT_COPY|FUTURE|pending_wifi/);
    for (const change of [{can_read_credentials:false}, {credentials_version:undefined}, {credentials_version:2}]) {
      const denied = projectDeviceSheet({...r,...change});
      expect(denied.appliedWifi).toBeNull(); expect(denied.appliedAdminCode).toBeNull();
      expect(denied.can_manage_credentials).toBe(false); expect(labelDataFromSheet(denied)).toBeNull();
    }
  });
  it('generated/unverified values and invalid dates never become applied; confirmations are independent', () => {
    const r = raw();
    for (const value of [null,'not-a-date','2999-01-01T00:00:00Z']) {
      const sheet = projectDeviceSheet({...r,wifi:{...r.wifi,wifi_applied_at:value,admin_code_applied_at:value}});
      expect(sheet.appliedWifi).toBeNull(); expect(sheet.appliedAdminCode).toBeNull(); expect(labelDataFromSheet(sheet)).toBeNull();
    }
    const wifiOnly = projectDeviceSheet({...r,wifi:{...r.wifi,admin_code_applied_at:null}});
    expect(wifiOnly.appliedAdminCode).toBeNull(); expect(labelDataFromSheet(wifiOnly)).not.toBeNull();
    const codeOnly = projectDeviceSheet({...r,wifi:{...r.wifi,wifi_applied_at:null}});
    expect(codeOnly.appliedAdminCode).not.toBeNull(); expect(labelDataFromSheet(codeOnly)).toBeNull();
  });
  it('pending and failed operations keep only the prior confirmed value, applied change invalidates fingerprint', () => {
    const r=raw(), original=labelDataFromSheet(projectDeviceSheet(r))!;
    for (const status of ['pending','failed']) {
      const sheet=projectDeviceSheet({...r,rotations:[{kind:'wifi',status}],wifi:{...r.wifi,pending_wifi_psk:'9876543210'}});
      expect(labelFingerprint(labelDataFromSheet(sheet)!)).toBe(labelFingerprint(original));
    }
    const next=labelDataFromSheet(projectDeviceSheet({...r,wifi:{...r.wifi,psk:'9876543210',wifi_applied_at:'2026-01-02T00:00:00Z'}}))!;
    expect(labelFingerprint(next)).not.toBe(labelFingerprint(original));
  });
  it('blocks absent/stock devices and malformed essential fields without truncating a 32-byte SSID', () => {
    const r=raw(), label=labelDataFromSheet(projectDeviceSheet(r))!;
    expect(new TextEncoder().encode(label.ssid)).toHaveLength(32);
    expect(labelFilename(label)).toBe('PS-XXXXXXXX-50x30mm.png');
    expect(label).not.toHaveProperty('admin_code'); expect(label).not.toHaveProperty('code');
    for (const wifi of [{...r.wifi,ssid:'W'.repeat(33)},{...r.wifi,ssid:'x\n'},{...r.wifi,ssid:'é'.repeat(17)},{...r.wifi,psk:'12345'},{...r.wifi,psk:'12345ABCDE'}]) {
      expect(labelDataFromSheet(projectDeviceSheet({...r,wifi}))).toBeNull();
    }
    for (const device of [null,{...r.device,status:'stock'},{...r.device,serial:'../escape'}]) expect(labelDataFromSheet(projectDeviceSheet({...r,device}))).toBeNull();
    expect(LABEL_WIDTH/LABEL_HEIGHT).toBe(5/3); expect(LABEL_MARGIN/LABEL_PPM*1000).toBeGreaterThanOrEqual(1.5);
  });
  it('screen QR escapes the Wi-Fi format and never contains the admin code', () => {
    const r=raw(), qr=wifiQrPayload(r.wifi.ssid,r.wifi.psk);
    expect(qr).not.toContain(r.wifi.admin_code);
    expect(qr).toContain('\\;'); expect(qr).toContain('\\:');
  });
});
