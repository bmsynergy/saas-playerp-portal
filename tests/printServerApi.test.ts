import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { addPrinter, createEnrollment, getCaCert, getFleet, getPanelState, projectFleetRow, projectPanelState, psErrorKey, removePrinter, requestScan, withFailureHook, printServerApi } from '../src/lib/printServerApi';
import { en } from '../src/locales/en';

const venue = '22222222-2222-4222-8222-222222222222';
// Keys the backend must never send and the portal must never keep.
const SECRETS = ['credential_hash', 'enrollment_code_hash', 'ca_cert_pem'];
const secrets = { credential_hash: 'HASH-1', enrollment_code_hash: 'HASH-2', ca_cert_pem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----' };
const rawServer = { id: 'ps-1', label: 'Front', status: 'active', device_id: 'dev', hostname: 'mini', software_version: '1.4.0', local_address: '192.168.1.10', local_port: 8443,
  enrolled_at: '2026-09-01T10:00:00Z', last_seen_at: '2026-10-01T11:59:00Z', last_status_at: '2026-10-01T11:59:00Z',
  last_status: { uptime_seconds: 3600, queue_depth: 2, portal_url: 'https://portal.invalid', note: 'ok', token: 'T', ...secrets },
  channel_opened_at: '2026-10-01T11:00:00Z', channel_token_at: '2026-10-01T11:00:00Z', online: true, credential_hint: 'ab12', ca_cert_available: true,
  ca_cert_fingerprint: 'AA:BB', ca_cert_updated_at: '2026-09-01T10:00:00Z', ...secrets };
const rawRow = { venue_id: venue, venue_name: 'Centro', venue_slug: 'centro', venue_is_active: true, print_server: rawServer,
  pending_enrollment: { id: 'en-1', label: null, expires_at: '2026-10-01T13:00:00Z', created_at: '2026-10-01T12:00:00Z', ...secrets },
  revoked_count: 1, last_revoked_at: null, printers_total: 2, printers_active: 1, printers_paused: 1, printers_with_error: 0, pending_jobs: 4, ...secrets };
const rawState = { venue_id: venue, can_manage: true, server_time: '2026-10-01T12:00:00Z', print_server: rawServer, pending_enrollment: null,
  printers: [{ id: 'pr-1', label: 'Bar', location: null, model: 'TM-T20', mac_address: 'AA:BB:CC:DD:EE:FF', paper_width_chars: 42, is_active: true, print_route: 'print_server',
    last_seen_at: null, last_error: null, last_report: { reachable: true, local_address: '192.168.1.50', model: 'TM-T20', state: 'ready', error: null, reported_at: '2026-10-01T11:59:00Z', ...secrets },
    last_report_at: '2026-10-01T11:59:00Z', pending_jobs: 3, workstations: [{ id: 'ws-1', name: 'Caja 1', ...secrets }], created_at: null, ...secrets }],
  last_scan: { command_id: 'cmd-1', status: 'done', created_at: null, expires_at: null, completed_at: null, error_code: null, error_detail: null,
    result: { candidates: [{ mac_address: '11:22:33:44:55:66', local_address: '192.168.1.60', model: null, hostname: null, port: 9100, reachable: true, printer_id: null, ...secrets }], count: 1, scanned_at: null, network: '192.168.1.0/24', ...secrets }, ...secrets },
  ...secrets };
const serialized = (value: unknown) => JSON.stringify(value);
const answer = (data: unknown, error: unknown = null) => rpc.mockResolvedValueOnce({ data, error });
beforeEach(() => rpc.mockReset());

describe('allow-list projections', () => {
  it('a fleet row is projected without hashes, certificate bodies or unknown keys', () => {
    const projected = projectFleetRow(rawRow);
    for (const key of [...SECRETS, 'credential_hint', 'channel_token_at', 'token', 'HASH-1', 'HASH-2', 'BEGIN CERTIFICATE']) expect(serialized(projected)).not.toContain(key);
    expect(projected).toMatchObject({ venue_id: venue, venue_name: 'Centro', printers_paused: 1, pending_jobs: 4,
      print_server: { id: 'ps-1', online: true, software_version: '1.4.0', ca_cert_fingerprint: 'AA:BB', last_status: { uptime_seconds: 3600, queue_depth: 2, portal_url: 'https://portal.invalid', note: 'ok' } },
      pending_enrollment: { id: 'en-1', expires_at: '2026-10-01T13:00:00Z' } });
    expect(Object.keys(projected.print_server!.last_status!).sort()).toEqual(['note', 'portal_url', 'queue_depth', 'uptime_seconds']);
  });
  it('the venue panel state is projected without them at any depth', () => {
    const projected = projectPanelState(rawState);
    for (const key of [...SECRETS, 'credential_hint', 'HASH-1', 'HASH-2', 'BEGIN CERTIFICATE']) expect(serialized(projected)).not.toContain(key);
    expect(projected.can_manage).toBe(true);
    expect(projected.print_server?.ca_cert_updated_at).toBe('2026-09-01T10:00:00Z');
    expect(projected.printers[0]).toMatchObject({ id: 'pr-1', label: 'Bar', pending_jobs: 3, workstations: [{ id: 'ws-1', name: 'Caja 1' }], last_report: { reachable: true, state: 'ready' } });
    expect(projected.last_scan?.result?.candidates[0]).toEqual({ mac_address: '11:22:33:44:55:66', local_address: '192.168.1.60', model: null, hostname: null, port: 9100, reachable: true, printer_id: null });
  });
  it('can_manage is false unless the backend says exactly true, and malformed rows are rejected', () => {
    expect(projectPanelState({ ...rawState, can_manage: 'yes' }).can_manage).toBe(false);
    expect(() => projectFleetRow({ venue_name: 'No id' })).toThrow();
    expect(() => projectPanelState(null)).toThrow();
  });
});
describe('RPC calls', () => {
  it('reads the fleet and the panel state through their projections', async () => {
    answer([rawRow]); answer(rawState);
    expect(serialized(await getFleet())).not.toContain('HASH');
    expect(rpc).toHaveBeenLastCalledWith('portal_ps_fleet', {});
    expect((await getPanelState(venue))?.venue_id).toBe(venue);
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_state', { p_venue_id: venue });
  });
  it('a 42501 answer is the denied state', async () => {
    answer(null, { code: '42501', message: 'permission denied' });
    await expect(getFleet()).rejects.toSatisfy(error => psErrorKey(error) === 'accessDenied');
  });
  it('creates an enrollment with a 60-minute code and returns only code and expiry', async () => {
    answer({ ok: true, print_server_id: 'ps-2', venue_id: venue, enrollment_code: 'ABCD-1234', expires_at: '2026-10-01T13:00:00Z', ...secrets });
    expect(await createEnrollment(venue, '  Front  ')).toEqual({ print_server_id: 'ps-2', enrollment_code: 'ABCD-1234', expires_at: '2026-10-01T13:00:00Z' });
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_create_enrollment', { p_venue_id: venue, p_label: 'Front', p_ttl_minutes: 60 });
  });
  it('maps backend error slugs to localized keys and unknown ones to the generic message', async () => {
    const input = { label: 'Bar', mac_address: 'AA:BB:CC:DD:EE:FF', model: '', location: '' };
    for (const [slug, key] of [['label_required', 'ps.error.labelRequired'], ['invalid_mac', 'ps.error.invalidMac'], ['no_active_print_server', 'ps.error.noActivePrintServer'],
      ['mac_already_registered', 'ps.error.macAlreadyRegistered'], ['label_already_used', 'ps.error.labelAlreadyUsed'], ['select * from secrets', 'genericError']] as const) {
      answer({ ok: false, error: slug });
      const key2 = await addPrinter(venue, input).then(() => 'resolved', psErrorKey);
      expect(key2).toBe(key);
      expect(en[key2 as keyof typeof en]).toBeTruthy();
    }
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_add_printer', { p_venue_id: venue, p_label: 'Bar', p_mac_address: 'AA:BB:CC:DD:EE:FF', p_model: null, p_location: null });
    answer({ ok: false, error: 'no_active_print_server' });
    await expect(requestScan(venue)).rejects.toSatisfy(error => psErrorKey(error) === 'ps.error.noActivePrintServer');
  });
  it('downloads only a public certificate and refuses private key material', async () => {
    answer({ ok: true, ca_cert_pem: secrets.ca_cert_pem, ca_cert_fingerprint: 'AA:BB', ca_cert_updated_at: null, filename: 'centro-ca.pem' });
    expect(await getCaCert(venue)).toMatchObject({ filename: 'centro-ca.pem', fingerprint: 'AA:BB' });
    answer({ ok: true, ca_cert_pem: secrets.ca_cert_pem + '\n-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----', filename: 'x.pem' });
    await expect(getCaCert(venue)).rejects.toSatisfy(error => psErrorKey(error) === 'ps.error.privateKeyRefused');
    answer({ ok: true, ca_cert_pem: secrets.ca_cert_pem, filename: '../../etc/passwd' });
    expect((await getCaCert(venue)).filename).toBe('print-server-ca.pem');
    answer({ ok: false, error: 'no_ca_cert_reported' });
    await expect(getCaCert(venue)).rejects.toSatisfy(error => psErrorKey(error) === 'ps.error.noCaCert');
  });
  it('removing a printer in use answers with what is affected instead of forcing', async () => {
    answer({ ok: false, error: 'printer_in_use', workstations: [{ id: 'ws-1', name: 'Caja 1' }], pending_jobs: 2 });
    expect(await removePrinter('pr-1', false)).toEqual({ removed: false, workstations: [{ id: 'ws-1', name: 'Caja 1' }], pending_jobs: 2 });
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_remove_printer', { p_printer_id: 'pr-1', p_force: false });
    answer({ ok: true });
    expect(await removePrinter('pr-1', true)).toEqual({ removed: true });
    expect(rpc).toHaveBeenLastCalledWith('ps_panel_remove_printer', { p_printer_id: 'pr-1', p_force: true });
  });
  it('the failure hook sees the mapped key and the error still reaches the caller', async () => {
    const seen: string[] = [];
    const api = withFailureHook(printServerApi, key => { seen.push(key); });
    answer(null, { code: '42501' });
    await expect(api.testPrint('pr-1')).rejects.toBeTruthy();
    expect(seen).toEqual(['accessDenied']);
  });
});
