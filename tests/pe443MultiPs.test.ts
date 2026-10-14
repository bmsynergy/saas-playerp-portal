import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { bindPrintServer, getPanelState, printServerApi, requestScan, SelectionRequiredError } from '../src/lib/printServerApi';
import { getDeviceSheet, rotateWifi } from '../src/lib/psDevice';
import { getVenueDevices, resolveDeviceSheet } from '../src/lib/psVenueDevices';
import { filterPsList, EMPTY_PS_LIST_FILTER, UNASSIGNED } from '../src/pages/PrintServersListPage';
import { projectInventory } from '../src/lib/printInventory';
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
    expect(list.devices.map(d => d.id)).toEqual([ps, 'inv-2']);
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

  it('filters the global list per device (serial, venue, unassigned)', () => {
    const item = (id: string, extra: Record<string, unknown>) => ({ id, device_id: null, label: null, hostname: null, assignment: 'assigned', venue_id: venue, venue_name: 'Centro', last_venue_name: null,
      connection: 'online', last_seen_at: null, last_report_at: null, firmware_version: null, firmware_known: false, error_count: 0, warning_count: 0, printers_total: 0, pending_jobs: 0, last_issue_at: null, issues: [], ...extra });
    const inv = projectInventory({ contract_version: 1, generated_at: '2026-10-14T00:00:00Z', online_window_seconds: 120, items: [
      item('a', { serial: 'PS-AAAA1111', label: 'Barra' }), item('b', { serial: 'PS-BBBB2222', label: 'Cocina' }),
      item('c', { serial: 'PS-CCCC3333', assignment: 'unassigned', connection: 'unassigned', venue_id: null, venue_name: null }) ] });
    expect(filterPsList(inv.items, { ...EMPTY_PS_LIST_FILTER, query: 'bbbb' }).map(i => i.id)).toEqual(['b']);
    expect(filterPsList(inv.items, { ...EMPTY_PS_LIST_FILTER, venue: UNASSIGNED }).map(i => i.id)).toEqual(['c']);
    expect(filterPsList(inv.items, { ...EMPTY_PS_LIST_FILTER, venue }).map(i => i.id)).toEqual(['a', 'b']);
  });

  it('has every new message in both languages', () => {
    for (const key of Object.keys(en).filter(k => k.startsWith('psm.') || k.startsWith('ps.error.selection'))) expect(es[key as keyof typeof en]).toBeTruthy();
  });
});
