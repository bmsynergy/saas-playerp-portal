import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { bindPrintServer, getPanelState, printServerApi, requestScan, SelectionRequiredError } from '../src/lib/printServerApi';
import { getDeviceSheet, rotateWifi } from '../src/lib/psDevice';
import { getVenueDevices, resolveDeviceSheet } from '../src/lib/psVenueDevices';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';

const venue = '22222222-2222-4222-8222-222222222222';
const ps = '33333333-3333-4333-8333-333333333333';
const choices = [{ id: ps, label: 'Barra', serial: 'PS-AAAA1111', online: true, printers_total: 2 }, { id: 'ps-b', label: 'Cocina', serial: 'PS-BBBB2222' }];
const answer = (data: unknown) => rpc.mockResolvedValueOnce({ data, error: null });

describe('PE-443 multi Print Server per venue', () => {
  beforeEach(() => rpc.mockReset());

  it('passes p_print_server_id explicitly only when a device is selected', async () => {
    answer({ venue_id: venue, can_manage: true, print_server: { id: ps }, printers: [] });
    await getPanelState(venue, undefined, 'admin', ps);
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_state', { p_venue_id: venue, p_print_server_id: ps });
    answer({ ok: true, command_id: 'c1', status: 'pending' });
    await bindPrintServer(printServerApi, ps).requestScan(venue);
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_request_scan', { p_venue_id: venue, p_print_server_id: ps });
    answer({ ok: true, jobs: [], total: 0, limit: 10, offset: 0 });
    await bindPrintServer(printServerApi, ps).getPrinterJobs(venue, 'pr-1', 10, 0);
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_printer_jobs', expect.objectContaining({ p_venue_id: venue, p_printer_id: 'pr-1', p_print_server_id: ps }));
    answer({ ok: true });
    await rotateWifi(venue, ps);
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_rotate_wifi', { p_venue_id: venue, p_print_server_id: ps });
  });

  it('never picks the first device when the backend asks for a selection', async () => {
    answer({ ok: true, venue_id: venue, selection_required: true, print_servers: choices, print_server: null });
    await expect(getPanelState(venue)).rejects.toBeInstanceOf(SelectionRequiredError);
    answer({ ok: false, error: 'ps_selection_required', print_servers: choices });
    const error = await requestScan(venue).catch(e => e);
    expect(error).toBeInstanceOf(SelectionRequiredError);
    expect((error as SelectionRequiredError).print_servers.map(c => c.id)).toEqual([ps, 'ps-b']);
    answer({ ok: true, venue_id: venue, selection_required: true, print_servers: choices });
    await expect(getDeviceSheet(venue)).rejects.toBeInstanceOf(SelectionRequiredError);
  });

  it('refuses a panel answer about another Print Server of the venue', async () => {
    answer({ venue_id: venue, can_manage: true, print_server: { id: 'ps-b' }, printers: [] });
    await expect(getPanelState(venue, undefined, 'admin', ps)).rejects.toMatchObject({ code: 'accessDenied' });
  });

  it('projects the venue device list and the sheet resolver', async () => {
    answer({ ok: true, venue_id: venue, can_manage: true, devices: [{ id: ps, print_server_id: ps, inventory_device_id: 'inv-1', serial: 'PS-AAAA1111', label: 'Barra', online: true, printers_total: 2, credential_hash: 'X' }, { id: 'inv-2', print_server_id: null, inventory_device_id: 'inv-2', serial: 'PS-CCCC3333' }],
      unassigned_printers: [{ id: 'pr-9', label: 'Terraza', mac_address: 'AA:BB:CC:DD:EE:01' }] });
    const list = await getVenueDevices(venue);
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_devices', { p_venue_id: venue });
    expect(list.devices.map(d => d.id)).toEqual(['inv-1', 'inv-2']); // PE-469 canonical inventory identity
    expect(JSON.stringify(list)).not.toContain('credential_hash');
    expect(list.unassigned_printers[0].label).toBe('Terraza');
    answer({ ok: true, venue_id: 'other', devices: [] });
    await expect(getVenueDevices(venue)).rejects.toMatchObject({ code: 'accessDenied' });
    answer({ ok: true, kind: 'inventory', print_server_id: null, inventory_device_id: 'inv-2', venue_id: null, venue_name: null, status: 'stock', can_manage: true, is_staff: true });
    expect(await resolveDeviceSheet('inv-2')).toMatchObject({ kind: 'inventory', inventory_device_id: 'inv-2', venue_id: null });
    expect(rpc).toHaveBeenLastCalledWith('ps_device_sheet_resolve', { p_id: 'inv-2' });
    answer({ ok: false, error: 'forbidden' });
    await expect(resolveDeviceSheet(ps)).rejects.toBeTruthy();
  });

  it('rejects a sheet resolver response for a different inventory device or Print Server', async () => {
    answer({ ok: true, kind: 'print_server', print_server_id: 'another-ps', inventory_device_id: 'another-device', venue_id: venue, is_staff: true });
    await expect(resolveDeviceSheet(ps)).rejects.toMatchObject({ code: 'accessDenied' });
  });

  it('has every new message in both languages', () => {
    for (const key of Object.keys(en).filter(k => k.startsWith('psm.') || k.startsWith('ps.error.selection'))) expect(es[key as keyof typeof en]).toBeTruthy();
  });
});
