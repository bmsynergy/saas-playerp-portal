import type { QueryClient } from '@tanstack/react-query';

// Every representation of the same unit must reread the authoritative link after a mutation.
export const PS_RELATED_QUERIES = [
  'ps-devices', 'ps-venue-overview', 'ps-venue-devices', 'ps-sheet-resolve', 'ps-device-resolve',
  'ps-device', 'ps-admin-device', 'ps-panel-ota', 'ps-inventory', 'ps-admin-device-sheet', 'ps-admin-device-manage', 'ps-state',
] as const;
export async function invalidatePsViews(client: QueryClient): Promise<void> {
  await Promise.all(PS_RELATED_QUERIES.map(key => client.invalidateQueries(
    { queryKey: [key] }, { throwOnError: true },
  )));
}
