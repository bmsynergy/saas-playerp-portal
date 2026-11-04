import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { getTenantReadinessList } from '../lib/tenantReadinessList';
import type { Lifecycle } from '../lib/tenantOnboarding';

export function useTenantReadinessList(query: string, lifecycle: Lifecycle | '', page: number, pageSize: number) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['tenant-readiness-list', session?.user.id, query, lifecycle, page, pageSize],
    enabled: !!session,
    queryFn: ({ signal }) => getTenantReadinessList(query, lifecycle, page, pageSize, signal),
    refetchInterval: 60_000,
  });
}
