import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { EMPTY_LIST_FILTERS, validDateRange } from './adminLists';
import { psErrorKey } from './printServerApi';
import { getOtaPage, type OtaPageFilter, type OtaPageKind } from './ota';

export function useOtaPage<K extends OtaPageKind>(kind: K, parentId: string | null = null, initialFilters: Partial<OtaPageFilter> = {}) {
  const { session, expire } = useAuth();
  const onDemand = kind === 'audit';
  const [filters, setFilters] = useState<OtaPageFilter>(() => ({...EMPTY_LIST_FILTERS,...initialFilters}));
  const [submitted, setSubmitted] = useState<OtaPageFilter | null>(null);
  const [searchNumber, setSearchNumber] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, changeSize] = useState(25);
  const valid = validDateRange(filters.from, filters.to);
  const started = !onDemand || submitted !== null;
  const queryFilters = onDemand ? submitted ?? EMPTY_LIST_FILTERS : filters;
  const query = useQuery({
    queryKey: ['ps-ota-page', session?.user.id, kind, parentId, queryFilters, pageSize, page, searchNumber],
    queryFn: ({ signal }) => getOtaPage(kind, queryFilters, pageSize, (page - 1) * pageSize, parentId, signal),
    enabled: !!session && valid && started,
    refetchInterval: onDemand ? false : 10_000,
    refetchOnWindowFocus: !onDemand,
    refetchOnReconnect: !onDemand,
    // Audit is an explicit search, including on return to this screen or retry.
    ...(onDemand ? { gcTime: 0, retry: false, refetchOnMount: false } : {}),
  });
  useEffect(() => { if (query.error && psErrorKey(query.error)==='sessionExpired') void expire(); }, [query.error, expire]);
  useEffect(() => { setPage(1); }, [parentId]);
  const total = started ? query.data?.total ?? 0 : 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (started && query.data && page > pageCount) setPage(pageCount);
  }, [started, query.data, page, pageCount]);
  const set = (key: keyof OtaPageFilter, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
    // Hide old results and disable further reads while preparing a different search.
    if (onDemand) setSubmitted(null);
  };
  const clear = () => {
    setFilters(EMPTY_LIST_FILTERS);
    setPage(1);
    if (onDemand) setSubmitted(null);
  };
  const search = () => {
    if (!valid) return;
    setSubmitted({ ...filters });
    setPage(1);
    setSearchNumber(n => n + 1);
  };
  const start = (page - 1) * pageSize;
  return { query, filters, set, clear, valid, started, search, pagination: {
    page, pageCount, pageSize, start, end: Math.min(start + pageSize, total), total,
    setPage, setPageSize: (size: number) => { changeSize(Math.max(1,Math.min(100,size))); setPage(1); }, reset: () => setPage(1),
  } };
}
