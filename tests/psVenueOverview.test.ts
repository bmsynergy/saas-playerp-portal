import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { getPsVenueOverview, projectPsVenueOverview } from '../src/lib/psVenueOverview';
import { filterPsVenueCards, EMPTY_PS_LIST_FILTER, UNASSIGNED } from '../src/pages/PrintServersListPage';

export const overviewFixture = () => ({
  contract_version: 1, generated_at: '2026-10-14T04:00:00Z', online_window_seconds: 180,
  summary: { venues: 1, print_servers: 2, unassigned: 2, in_stock: 1, retired: 1 },
  venues: [{ venue_id: 'venue-a', venue_name: 'Park', venue_slug: 'park', venue_is_active: true, location_short: 'Ponce, PR', print_server_count: 2,
    states: { online: 1, offline: 0, unknown: 0, pending: 1, attention: 1 }, print_servers: [
      { print_server_id: 'ps-a', inventory_device_id: 'device-a', serial: 'PS-A', hostname: 'cashier', label: 'Front', firmware_version: '0.3.3', state: 'online', attention: true, error_count: 1, warning_count: 0, last_seen_at: null },
      { print_server_id: 'ps-b', inventory_device_id: 'device-b', serial: 'PS-B', hostname: 'kitchen', label: null, firmware_version: null, state: 'pending', attention: false, error_count: 0, warning_count: 0, last_seen_at: null },
    ] }],
  unassigned: { count: 2, in_stock: 1, retired: 1, devices: [
    { inventory_device_id: 'device-b', serial: 'PS-B', hostname: 'kitchen', label: null, model: 'rpi4-2gb', status: 'stock', last_venue_name: null, pending_venue_name: 'Park', created_at: null },
    { inventory_device_id: 'device-c', serial: 'PS-C', hostname: 'retired', label: null, model: 'rpi4-2gb', status: 'retired', last_venue_name: 'Park', pending_venue_name: null, created_at: null },
  ] },
});
describe('PE-447 venue overview', () => {
  beforeEach(() => rpc.mockReset());
  it('keeps multiple devices, pending enrollments and retired/stock counts without leaking unknown fields', () => {
    const source = overviewFixture();
    const result = projectPsVenueOverview({ ...source, secret: 'hidden', venues: source.venues.map(venue => ({ ...venue, print_servers: venue.print_servers.map(server => ({ ...server, credential_hash: 'hidden' })) })) });
    expect(result).toEqual(source);
    expect(JSON.stringify(result)).not.toContain('hidden');
    expect(result.unassigned.devices[0].pending_venue_name).toBe('Park');
  });
  it('rejects unsupported contracts, malformed counts and unknown states instead of inventing a status', () => {
    expect(() => projectPsVenueOverview({ ...overviewFixture(), contract_version: 2 })).toThrow();
    const source = overviewFixture(); source.venues[0].print_servers[0].state = 'unexpected';
    expect(() => projectPsVenueOverview(source)).toThrow();
    expect(() => projectPsVenueOverview({ ...overviewFixture(), unassigned: { count: -1 } })).toThrow();
  });
  it('filters devices within their venue, combines venue/status/search and preserves an empty stock entry', () => {
    const data = projectPsVenueOverview(overviewFixture());
    const cards = filterPsVenueCards(data, { ...EMPTY_PS_LIST_FILTER, query: 'kitchen', venue: 'venue-a', connection: 'pending' });
    expect(cards).toHaveLength(1);
    expect(cards[0].kind === 'venue' && cards[0].servers.map(server => server.print_server_id)).toEqual(['ps-b']);
    expect(filterPsVenueCards(data, { ...EMPTY_PS_LIST_FILTER, query: 'Ponce', connection: 'online' })).toHaveLength(1);
    expect(filterPsVenueCards(data, { ...EMPTY_PS_LIST_FILTER, venue: UNASSIGNED })).toEqual([{ kind: 'unassigned' }]);
    expect(filterPsVenueCards(data, { ...EMPTY_PS_LIST_FILTER, query: 'absent' })).toEqual([]);
    expect(filterPsVenueCards({ ...data, venues: [], unassigned: { count: 0, in_stock: 0, retired: 0, devices: [] } }, EMPTY_PS_LIST_FILTER)).toEqual([{ kind: 'unassigned' }]);
  });
  it('uses the staff RPC, forwards cancellation and preserves access denial', async () => {
    const signal = new AbortController().signal;
    const abortSignal = vi.fn().mockResolvedValue({ data: overviewFixture(), error: null });
    rpc.mockReturnValue({ abortSignal });
    expect((await getPsVenueOverview(signal)).venues).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('portal_ps_venue_overview'); expect(abortSignal).toHaveBeenCalledWith(signal);
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(getPsVenueOverview()).rejects.toMatchObject({ code: '42501' });
  });
});
