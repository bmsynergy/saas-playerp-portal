import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { invalidatePsViews, PS_RELATED_QUERIES } from '../src/lib/psInvalidation';

describe('a device mutation refreshes all representations', () => {
  it('invalidates inactive lists and refetches active sheets, surfacing failures for retry', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const key of PS_RELATED_QUERIES) client.setQueryData([key, 'user', 'fixture'], { old: true });
    client.setQueryData(['unrelated'], 'keep');
    const fetchSheet = vi.fn().mockRejectedValue(new Error('offline'));
    const observer = new QueryObserver(client, { queryKey: ['ps-sheet-resolve', 'user', 'fixture'], queryFn: fetchSheet, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    await expect(invalidatePsViews(client)).rejects.toThrow('offline');
    for (const key of PS_RELATED_QUERIES) expect(client.getQueryState([key, 'user', 'fixture'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
    fetchSheet.mockResolvedValue({ label: 'saved', state: 'asignado_pendiente_sync' });
    await invalidatePsViews(client);
    expect(client.getQueryData(['ps-sheet-resolve', 'user', 'fixture'])).toEqual({ label: 'saved', state: 'asignado_pendiente_sync' });
    unsubscribe(); client.clear();
  });
});
