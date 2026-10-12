import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { projectRecoveryLabel } from '../src/lib/psRecoveryLabel';
import { labelFingerprint } from '../src/lib/psLabel';
const response = () => ({ ok: true, label_version: 1, ready: true, missing: [], wifi_rotation_pending: false,
  label: { device_id: 'fixture', serial: 'PS-ABCDEFGH', ssid: 'Print Server', psk: '0123456789', wifi_applied_at: '2026-01-01T00:00:00Z' } });

describe('confirmed recovery label contract', () => {
  it('copies only printable confirmed fields', () => {
    const raw = response();
    const projected = projectRecoveryLabel({ ...raw, admin_code: 'ADMIN_SENTINEL', label: { ...raw.label, admin_code: 'ADMIN_SENTINEL', pending_psk: 'PENDING_SENTINEL' } });
    expect(projected.ready).toBe(true);
    expect(Object.keys(projected.label!).sort()).toEqual(['appliedAt', 'deviceId', 'password', 'serial', 'ssid']);
    expect(JSON.stringify(projected)).not.toMatch(/SENTINEL/);
  });
  it.each(['credentials_permission', 'device_not_assigned', 'print_server_not_active', 'wifi_not_confirmed'])('preserves actionable missing reason %s without data', reason => {
    expect(projectRecoveryLabel({ ...response(), ready: false, missing: [reason] })).toMatchObject({ ready: false, missing: [reason], label: null });
  });
  it('fails closed for malformed, inconsistent and unsupported contracts', () => {
    for (const patch of [{label_version:2}, {ready:false}, {missing:['future_reason']}, {wifi_rotation_pending:null}, {label:null}, {label:{...response().label,wifi_applied_at:null}}, {label:{...response().label,psk:'invalid'}}]) {
      expect(projectRecoveryLabel({...response(), ...patch})).toMatchObject({ready:false,label:null,missing:['invalid_label']});
    }
  });
  it('distinguishes current confirmed data from pending rotation and replaces every printed field on next read', () => {
    const old = projectRecoveryLabel({...response(),wifi_rotation_pending:true});
    expect(old.wifiRotationPending).toBe(true);
    const fresh = projectRecoveryLabel({...response(), label:{...response().label,serial:'PS-12345678',ssid:'New SSID',psk:'9876543210',wifi_applied_at:'2026-01-02T00:00:00Z'}});
    expect(labelFingerprint(fresh.label!)).not.toEqual(labelFingerprint(old.label!));
    expect(fresh.label).toMatchObject({serial:'PS-12345678',ssid:'New SSID',password:'9876543210'});
  });
});
