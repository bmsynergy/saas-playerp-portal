import { supabase } from './supabase';
import { PortalError } from './errors';
import type { Lifecycle } from './tenantOnboarding';

export interface ReadinessListItem {
  venue_id: string;
  venue_name: string;
  venue_slug: string | null;
  lifecycle: Lifecycle;
}
export interface ReadinessList {
  items: ReadinessListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  summary: Partial<Record<Lifecycle, number>>;
}
const lifecycles: Lifecycle[] = ['setup_incomplete', 'ready', 'active', 'suspended'];
export async function getTenantReadinessList(query: string, lifecycle: Lifecycle | '', page: number, pageSize: number, signal?: AbortSignal): Promise<ReadinessList> {
  const request = supabase.rpc('portal_tenant_readiness_list', {
    p_query: query.trim() || null, p_lifecycle: lifecycle || null, p_page: page, p_page_size: pageSize,
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || !Number.isInteger(data.total) || data.total < 0
    || !Number.isInteger(data.page) || data.page < 1 || !Number.isInteger(data.page_size) || data.page_size < 1
    || !Number.isInteger(data.pages) || data.pages < 1 || !data.summary || typeof data.summary !== 'object'
    || data.items.some((item: ReadinessListItem) => typeof item?.venue_id !== 'string' || typeof item.venue_name !== 'string' || !lifecycles.includes(item.lifecycle))) {
    throw new PortalError('genericError');
  }
  const summary: ReadinessList['summary'] = {};
  for (const lifecycle of lifecycles) {
    const count = data.summary[lifecycle];
    if (count !== undefined && (!Number.isInteger(count) || count < 0)) throw new PortalError('genericError');
    summary[lifecycle] = count ?? 0;
  }
  return { items: data.items.map((item: ReadinessListItem) => ({ venue_id: item.venue_id, venue_name: item.venue_name, venue_slug: item.venue_slug, lifecycle: item.lifecycle })),
    total: data.total, page: data.page, page_size: data.page_size, pages: data.pages, summary };
}
