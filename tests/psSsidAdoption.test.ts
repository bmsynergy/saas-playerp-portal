import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { AdoptError, projectAdoptResult, projectDeviceSheet, projectSsidAdoption } from '../src/lib/psDevice';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';

const sheet = (adoption: unknown) => ({
  ok: true, credentials_version: 1, can_read_credentials: true, can_manage_credentials: true,
  device: { id: 'd', serial: 'PS-YG5FY6RV', hostname: 'playerp-ps-yg5fy6rv', model: 'rpi4-2gb', status: 'assigned', legacy: true },
  wifi: null, rotations: [], cert: {}, cert_operations: [], ps_online: true, last_seen_at: null, wifi_ssid_adoption: adoption,
});

describe('PE-440 canonical Wi-Fi name adoption', () => {
  it('projects the adoption state from the device sheet without secrets', () => {
    const a = projectDeviceSheet(sheet({ canonical_ssid: 'PlayERP-Setup-YG5FY6RV', current_ssid: 'PE428-FIXTURE', state: 'pending', command_id: 'c1', psk: '0123456789' })).ssidAdoption;
    expect(a).toMatchObject({ canonical_ssid: 'PlayERP-Setup-YG5FY6RV', current_ssid: 'PE428-FIXTURE', state: 'pending', reprint_label: false });
    expect(JSON.stringify(a)).not.toContain('0123456789');
    expect(projectSsidAdoption({ canonical_ssid: 'PlayERP-Setup-YG5FY6RV', state: 'applied', reprint_label: true })?.reprint_label).toBe(true);
  });
  it('rejects unknown states or a non-canonical name (older backend or tampered data)', () => {
    expect(projectDeviceSheet(sheet(undefined)).ssidAdoption).toBeNull();
    expect(projectSsidAdoption({ canonical_ssid: 'PlayERP-Setup-001', state: 'available' })).toBeNull();
    expect(projectSsidAdoption({ canonical_ssid: 'PlayERP-Setup-YG5FY6RV', state: 'whatever' })).toBeNull();
  });
  it('maps preview, pending and backend rejections', () => {
    expect(projectAdoptResult({ ok: true, state: 'preview', current_ssid: 'PlayERP-Setup-001', canonical_ssid: 'PlayERP-Setup-JHG77BM7' }))
      .toMatchObject({ state: 'preview', current_ssid: 'PlayERP-Setup-001', canonical_ssid: 'PlayERP-Setup-JHG77BM7' });
    expect(projectAdoptResult({ ok: true, state: 'pending', already: true, command_id: 'c1', canonical_ssid: 'PlayERP-Setup-JHG77BM7' }).already).toBe(true);
    expect(() => projectAdoptResult({ ok: false, error: 'canonical_ssid_in_use' })).toThrow(AdoptError);
    try { projectAdoptResult({ ok: false, error: 'nope' }); } catch (e) { expect((e as AdoptError).key).toBe('adopt.error.other'); }
  });
  it('labels exist in both languages and the confirmation says only the SSID changes', () => {
    for (const key of Object.keys(en).filter(k => k.startsWith('adopt.'))) expect((es as Record<string, string>)[key]).toBeTruthy();
    expect(es['adopt.button' as keyof typeof es]).toBe('Adoptar nombre Wi-Fi del equipo');
    expect(es['adopt.keeps.key' as keyof typeof es]).toMatch(/clave WPA2 y el código administrativo no cambian/);
  });
});
