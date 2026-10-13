import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { projectDeviceSheet, projectEnroll } from '../src/lib/psDevice';
import { es } from '../src/locales/es';

const sheet = (enroll: unknown, legacy = false) => ({
  ok: true, credentials_version: 1, can_read_credentials: true, can_manage_credentials: true,
  device: { id: 'd', serial: 'PS-ABCDEFGH', hostname: 'playerp-ps-abcdefgh', model: 'rpi4-2gb', status: 'assigned', legacy },
  wifi: null, rotations: [], cert: {}, cert_operations: [], ps_online: true, last_seen_at: null, enroll_credentials: enroll,
});

describe('PE-438 enrollment state on the device sheet', () => {
  it('projects pending, applied and a faithful partial failure without secrets', () => {
    expect(projectDeviceSheet(sheet({ state: 'pending', wifi: 'pending', admin_code: 'pending' })).enroll?.state).toBe('pending');
    expect(projectDeviceSheet(sheet({ state: 'applied', wifi: 'applied', admin_code: 'applied', acked_at: '2026-10-13T22:52:47Z' })).enroll)
      .toMatchObject({ state: 'applied', wifi: 'applied', admin_code: 'applied' });
    const partial = projectEnroll({ state: 'failed', wifi: 'applied', admin_code: 'failed', admin_code_error: 'invalid_admin_code', psk: '0123456789' });
    expect(partial).toEqual({ state: 'failed', wifi: 'applied', admin_code: 'failed', wifi_error: null, admin_code_error: 'invalid_admin_code', acked_at: null });
    expect(JSON.stringify(partial)).not.toContain('0123456789');
  });
  it('ignores unknown or missing states (older backend)', () => {
    expect(projectDeviceSheet(sheet(undefined)).enroll).toBeNull();
    expect(projectEnroll({ state: 'whatever' })).toBeNull();
  });
  it('no new-enrollment text asks to rotate or reconcile to get the label', () => {
    for (const key of ['dev.enroll.state.pending', 'dev.enroll.state.applied', 'dev.enroll.next.pending', 'dev.enroll.next.applied', 'dev.help.enroll'] as const) {
      const text = (es as Record<string, string>)[key];
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/\brot(a|ar|ación)\b.*etiqueta|pulsa .*Rotar/i);
    }
    expect((es as Record<string, string>)['dev.enroll.next.pending']).toMatch(/no hace falta conciliar ni rotar/);
  });
});
