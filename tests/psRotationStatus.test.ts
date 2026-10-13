import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { latestRotation, pendingReason, projectDeviceSheet, projectLegacyContext, type DeviceOp } from '../src/lib/psDevice';

const base = { ok: true, credentials_version: 1, can_read_credentials: true, device: { id: 'd1', serial: 'PS-ABCD1234' } };
const past = '2026-01-01T10:00:00Z';
describe('PE-428 rotation status projection', () => {
  it('keeps the confirmed value and projects wait fields; absent groups stay null', () => {
    const s = projectDeviceSheet({ ...base, ps_online: true, last_seen_at: past,
      wifi: { ssid: 'PS-REC', psk: '0123456789', wifi_applied_at: past, admin_code: null, admin_code_applied_at: null },
      rotations: [{ command_id: 'c1', kind: 'wifi', status: 'pending', requested_at: past, received_at: past, wait_reason: 'printing', error_detail: 'x\u0000y' }] });
    expect(s.appliedWifi?.ssid).toBe('PS-REC');
    expect(s.appliedAdminCode).toBeNull();
    expect(s.ps_online).toBe(true);
    expect(s.rotations[0]).toMatchObject({ wait_reason: 'printing', received_at: past, error_detail: null, previous_kept: false });
  });
  it('unknown reasons become other; pending fallback follows the contract', () => {
    const s = projectDeviceSheet({ ...base, rotations: [{ command_id: 'c', kind: 'wifi', status: 'pending', wait_reason: 'weird' }] });
    expect(s.rotations[0].wait_reason).toBe('other');
    const op: DeviceOp = { command_id: 'c', kind: 'wifi', status: 'pending', requested_at: null, completed_at: null, error_code: null };
    expect(pendingReason(op, false)).toBe('device_offline');
    expect(pendingReason(op, true)).toBe('awaiting_device');
    expect(pendingReason({ ...op, received_at: past }, true)).toBe('applying');
  });
  it('latestRotation picks the newest of the requested kind', () => {
    const mk = (id: string, kind: string, at: string): DeviceOp => ({ command_id: id, kind, status: 'applied', requested_at: at, completed_at: null, error_code: null });
    expect(latestRotation([mk('a', 'wifi', past), mk('b', 'wifi', '2026-02-01T00:00:00Z'), mk('c', 'admin_code', '2026-03-01T00:00:00Z')], 'wifi')?.command_id).toBe('b');
    expect(latestRotation([], 'wifi')).toBeNull();
  });
  it('legacy context never fakes a CA hash and maps errors', () => {
    const ctx = projectLegacyContext({ ok: true, venue_id: 'v', serial: 'PS-1', legacy: true, ca_cert_der_sha256: 'zz', wifi_confirmed: true });
    expect(ctx.ca_cert_der_sha256).toBeNull();
    expect(ctx.wifi_confirmed).toBe(true);
    expect(() => projectLegacyContext({ ok: false, error: 'ca_mismatch' })).toThrow('legacy.error.ca_mismatch');
    expect(() => projectLegacyContext({ ok: false, error: 'boom' })).toThrow('legacy.error.other');
  });
});
