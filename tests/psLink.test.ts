import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { PS_LINK_STATES, PsLinkError, prepareDevice, projectAssignResult, projectPsLink, psLinkErrorText, psLinkStateClass, psLinkStateKey, reportedOr, setDeviceLabel, setupSsid, validatePsLabel } from '../src/lib/psLink';
import { assignDevice } from '../src/lib/psDevice';
import { projectVenueDevice, projectSheetRef } from '../src/lib/psVenueDevices';
import { projectPsVenueOverview } from '../src/lib/psVenueOverview';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';

export const linkFixture = (over: Record<string, unknown> = {}) => ({
  device_id: 'device-1', serial: 'PS-ABCD2345', label: 'Barra', display_name: 'Barra', model: 'rpi4-2gb', model_label: 'Raspberry Pi 4 2GB',
  venue_id: 'venue-1', venue_name: 'Park', state: 'asignado_pendiente_sync', lifecycle: 'assigned', legacy: false, prepared: true, print_server_id: null,
  rev: 2, ack_rev: 1, ack_at: null, changed_at: '2026-10-14T10:00:00Z',
  preparation: { state: 'prepared', code_expires_at: null, prepared_at: '2026-10-13T10:00:00Z' },
  reported: { firmware_version: null, hostname: null, last_seen_at: null },
  onboarding: { missing: ['device_sync'], next_step: 'wait_sync' }, ...over,
});
const t = (key: string) => (es as Record<string, string>)[key] ?? key;
beforeEach(() => rpc.mockReset());

describe('PE-462 state labels', () => {
  it('maps every link state to the agreed es/en label', () => {
    const expected = { pendiente_preparacion: ['Pendiente de preparación', 'Pending preparation'], en_stock: ['En stock', 'In stock'],
      asignado_pendiente_sync: ['Asignado · pendiente de sincronización', 'Assigned · pending sync'], sincronizado: ['Sincronizado', 'Synced'], retirado: ['Retirado', 'Retired'] };
    for (const state of PS_LINK_STATES) {
      const key = psLinkStateKey(state) as keyof typeof en;
      expect([es[key], en[key]]).toEqual(expected[state]);
    }
    expect(psLinkStateClass('sincronizado')).toBe('server-online');
    expect(psLinkStateClass('retirado')).toBe('server-revoked');
    expect(psLinkStateClass('en_stock')).toBe('server-pending');
    expect(psLinkStateClass('asignado_pendiente_sync')).toBe('server-offline');
  });
  it('has the same psLink keys in both locales', () => {
    const keys = (o: object) => Object.keys(o).filter(k => k.startsWith('psLink.')).sort();
    expect(keys(es)).toEqual(keys(en));
  });
});

describe('PE-462 projection', () => {
  it('projects the DTO closed and never invents reported values', () => {
    const link = projectPsLink({ ...linkFixture(), secret: 'hidden', reported: { firmware_version: null, hostname: '', last_seen_at: null, token: 'hidden' } });
    expect(link).toMatchObject({ device_id: 'device-1', state: 'asignado_pendiente_sync', venue_name: 'Park', reported: { firmware_version: null, hostname: null, last_seen_at: null } });
    expect(JSON.stringify(link)).not.toContain('hidden');
    expect(reportedOr(link!.reported.hostname, 'Pendiente')).toBe('Pendiente');
    expect(reportedOr('  ', 'Pending')).toBe('Pending');
    expect(reportedOr('0.3.22', 'Pending')).toBe('0.3.22');
  });
  it('returns null for an absent or malformed link so old backends fall back', () => {
    expect(projectPsLink(undefined)).toBeNull();
    expect(projectPsLink({ ...linkFixture(), state: 'activo' })).toBeNull();
    expect(projectPsLink({ ...linkFixture(), device_id: '' })).toBeNull();
    expect(projectVenueDevice({ id: 'ps-1', serial: 'PS-1' }).link).toBeUndefined();
    expect(projectVenueDevice({ id: 'ps-1', link: linkFixture() }).link?.state).toBe('asignado_pendiente_sync');
    expect(projectSheetRef({ kind: 'inventory', inventory_device_id: 'device-1', link: linkFixture() }).link?.serial).toBe('PS-ABCD2345');
  });
  it('drops unknown onboarding items and falls back display_name to label or serial', () => {
    const link = projectPsLink({ ...linkFixture({ label: null, display_name: null }), onboarding: { missing: ['prepare_code', 'bogus'], next_step: 'nope' } });
    expect(link?.display_name).toBe('PS-ABCD2345');
    expect(link?.onboarding).toEqual({ missing: ['prepare_code'], next_step: null });
  });
  it('lists venue overview items assigned but not yet prepared (no print_server_id)', () => {
    const overview = projectPsVenueOverview({ contract_version: 1, generated_at: null, online_window_seconds: 180,
      summary: { venues: 1, print_servers: 0, unassigned: 0, in_stock: 0, retired: 0 },
      venues: [{ venue_id: 'venue-1', venue_name: 'Park', venue_is_active: true, print_server_count: 1, states: { online: 0, offline: 0, unknown: 0, pending: 1, attention: 0 },
        print_servers: [{ print_server_id: null, inventory_device_id: 'device-1', serial: 'PS-ABCD2345', state: 'pending', error_count: 0, warning_count: 0, link: linkFixture({ state: 'pendiente_preparacion' }) }] }],
      unassigned: { count: 0, in_stock: 0, retired: 0, devices: [] } });
    expect(overview.venues[0].print_servers[0]).toMatchObject({ id: 'device-1', print_server_id: null, link: { state: 'pendiente_preparacion' } });
  });
});

describe('PE-462 label validation mirrors the server', () => {
  it('trims, accepts 1..80 chars and clears on empty', () => {
    expect(validatePsLabel('  Barra  ')).toEqual({ ok: true, value: 'Barra' });
    expect(validatePsLabel('   ')).toEqual({ ok: true, value: null });
    expect(validatePsLabel('a'.repeat(80))).toEqual({ ok: true, value: 'a'.repeat(80) });
    expect(validatePsLabel('ñ'.repeat(80))).toMatchObject({ ok: true });
    expect(validatePsLabel('a'.repeat(81))).toEqual({ ok: false, reason: 'too_long' });
  });
  it('rejects < > and control characters', () => {
    for (const bad of ['<b>', 'a>b', 'line\nbreak', 'tab\there', 'nul\u0000', 'del\u007f']) expect(validatePsLabel(bad)).toEqual({ ok: false, reason: 'invalid_chars' });
    expect(validatePsLabel('Cocina · Barra 2 (ñ)')).toMatchObject({ ok: true });
  });
});

describe('PE-462 RPCs', () => {
  it('assign never returns a code and reports idempotent repeats', async () => {
    rpc.mockResolvedValue({ data: { ok: true, already_assigned: true, device_id: 'device-1', venue_id: 'venue-1', print_server_id: null, link: linkFixture(), enrollment_code: 'pse_secret' } });
    const out = await assignDevice('device-1', 'venue-1');
    expect(out.already_assigned).toBe(true);
    expect(out.link?.state).toBe('asignado_pendiente_sync');
    expect(JSON.stringify(out)).not.toContain('pse_');
    expect(rpc).toHaveBeenCalledWith('ps_admin_device_assign', { p_device_id: 'device-1', p_venue_id: 'venue-1' });
  });
  it('surfaces the server message and next step on refusal', () => {
    let error: unknown;
    try { projectAssignResult({ ok: false, error: 'device_assigned_elsewhere', message: 'Está asignado a Otro local.', next_step: 'move' }); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(PsLinkError);
    expect(psLinkErrorText(error, t, 'x')).toBe(`Está asignado a Otro local. ${es['psLink.next.move']}`);
    expect(psLinkErrorText(new PsLinkError('device_not_prepared', null, 'prepare'), t, 'x')).toBe(`${es['psLink.error.device_not_prepared']} ${es['psLink.next.prepare']}`);
    expect(psLinkErrorText(new PsLinkError('weird', null, null), t, 'x')).toBe(es['psLink.error.other']);
    expect(psLinkErrorText(new Error('net'), t, 'fallback')).toBe('fallback');
  });
  it('prepare is the only call returning a code, and supports regeneration', async () => {
    rpc.mockResolvedValue({ data: { ok: true, device_id: 'device-1', enrollment_code: null, expires_at: '2026-10-15T10:00:00Z', already_prepared: false, code_already_issued: true, link: linkFixture({ state: 'pendiente_preparacion' }) } });
    expect(await prepareDevice('device-1')).toMatchObject({ enrollment_code: null, code_already_issued: true });
    rpc.mockResolvedValue({ data: { ok: true, device_id: 'device-1', enrollment_code: 'pse_new', expires_at: '2026-10-15T10:00:00Z', already_prepared: false, code_already_issued: false } });
    expect((await prepareDevice('device-1', true)).enrollment_code).toBe('pse_new');
    expect(rpc.mock.calls.map(call => call[1])).toEqual([{ p_device_id: 'device-1', p_regenerate: false }, { p_device_id: 'device-1', p_regenerate: true }]);
  });
  it('set label sends null to clear and maps 42501 to forbidden', async () => {
    rpc.mockResolvedValue({ data: { ok: true, changed: false, device_id: 'device-1', label: null, link: linkFixture({ label: null }) } });
    expect(await setDeviceLabel('device-1', null)).toMatchObject({ changed: false, label: null });
    expect(rpc).toHaveBeenCalledWith('ps_device_set_label', { p_device_id: 'device-1', p_label: null });
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(setDeviceLabel('device-1', 'x')).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('names the Wi-Fi setup assistant after the serial', () => {
    expect(setupSsid('PS-ABCD2345')).toBe('PlayERP-Setup-ABCD2345');
  });
});
