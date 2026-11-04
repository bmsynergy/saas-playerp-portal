import { describe, it, expect, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { getTenantReadinessList } from '../src/lib/tenantReadinessList';

describe('server tenant directory contract', () => {
  it('sends search, lifecycle and page to the server and preserves its totals', async () => {
    rpc.mockResolvedValueOnce({ data: { items: [{ venue_id: 'v', venue_name: 'Venue', venue_slug: 'venue', lifecycle: 'ready' }], total: 131, page: 2, page_size: 25, pages: 6, summary: { active: 130, ready: 1 } }, error: null });
    const result = await getTenantReadinessList(' Venue ', 'ready', 2, 25);
    expect(rpc).toHaveBeenCalledWith('portal_tenant_readiness_list', { p_query: 'Venue', p_lifecycle: 'ready', p_page: 2, p_page_size: 25 });
    expect(result).toMatchObject({ total: 131, page: 2, pages: 6, summary: { active: 130, ready: 1, suspended: 0, setup_incomplete: 0 } });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('city');
  });
  it('passes cancellation and rejects an invalid response instead of displaying zero totals', async () => {
    const signal = new AbortController().signal;
    const abortSignal = vi.fn().mockResolvedValue({ data: { items: [] }, error: null });
    rpc.mockReturnValueOnce({ abortSignal });
    await expect(getTenantReadinessList('', '', 1, 5, signal)).rejects.toThrow('genericError');
    expect(abortSignal).toHaveBeenCalledWith(signal);
  });
});
