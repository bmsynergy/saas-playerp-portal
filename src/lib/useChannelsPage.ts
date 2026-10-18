import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { getOtaPage, type OtaPageFilter } from './ota';
import { channelListState, CHANNEL_PAGE_SIZE } from './channelNavigation';
import { psErrorKey } from './printServerApi';
import type { AdminVenueOption } from './psAdminDevice';

export function useChannelsPage() {
  const {session, expire} = useAuth();
  const [params, setParams] = useSearchParams();
  const {filters, page, venueLabel} = channelListState(params);
  const selected = !!filters.channel;
  const pageSize = CHANNEL_PAGE_SIZE;
  const query = useQuery({
    queryKey: ['ps-ota-page', session?.user.id, 'channels', filters, selected ? page : 0, pageSize],
    queryFn: async ({signal}) => {
      const result = await getOtaPage('channels', filters, selected ? pageSize : 1, selected ? (page-1)*pageSize : 0, filters.group_id || null, signal);
      // The contract minimum is one row. Before selection only counts are exposed to the view.
      return selected ? result : {...result, items: [], total: 0};
    },
    enabled: !!session, refetchInterval: 10_000,
  });
  useEffect(() => { if (query.error && psErrorKey(query.error) === 'sessionExpired') void expire(); }, [query.error, expire]);
  const change = (values: Record<string,string|null>, replace = false) => setParams(current => {
    const next = new URLSearchParams(current);
    for (const [key,value] of Object.entries(values)) value ? next.set(key,value) : next.delete(key);
    return next;
  }, {replace});
  const setPage = (n: number) => change({page: String(Math.max(1, Math.trunc(n)))});
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total/pageSize));
  useEffect(() => {
    if (selected && query.isSuccess && !query.isFetching && page > pageCount) change({page:String(pageCount)}, true);
  }, [selected, query.isSuccess, query.isFetching, page, pageCount]);
  const keys: Partial<Record<keyof OtaPageFilter,string>> = {query:'q',channel:'channel',status:'status',venue_id:'venue',group_id:'group'};
  const set = (key: keyof OtaPageFilter, value: string) => {
    const param = keys[key];
    if (param) change({[param]:value, page:null}, key === 'query');
  };
  const clear = () => change({q:null,status:null,venue:null,venueName:null,group:null,page:null});
  const setVenue = (venue: AdminVenueOption | null) => change({venue:venue?.id??null,venueName:venue?.name??null,page:null});
  const start = (page-1)*pageSize;
  return {query, filters, set, clear, valid:true, venueLabel, setVenue, pagination:{
    page, pageSize, pageCount, start, end:Math.min(start+pageSize,total), total,
    setPage, setPageSize: (_size:number) => {}, reset:()=>setPage(1),
  }};
}
