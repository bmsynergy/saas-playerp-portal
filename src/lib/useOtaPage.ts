import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { EMPTY_LIST_FILTERS, validDateRange } from './adminLists';
import { getOtaPage, type OtaPageFilter, type OtaPageKind } from './ota';

export function useOtaPage<K extends OtaPageKind>(kind: K, parentId: string | null = null) {
  const {session}=useAuth();
  const [filters,setFilters]=useState<OtaPageFilter>(EMPTY_LIST_FILTERS);
  const [page,setPage]=useState(1);
  const [pageSize,changeSize]=useState(25);
  const valid=validDateRange(filters.from,filters.to);
  const query=useQuery({queryKey:['ps-ota-page',session?.user.id,kind,parentId,filters,pageSize,page],
    queryFn:({signal})=>getOtaPage(kind,filters,pageSize,(page-1)*pageSize,parentId,signal),enabled:!!session&&valid,refetchInterval:10_000});
  const total=query.data?.total??0, pageCount=Math.max(1,Math.ceil(total/pageSize));
  useEffect(()=>{if(query.data&&page>pageCount)setPage(pageCount);},[query.data,page,pageCount]);
  const set=(key: keyof OtaPageFilter,value:string)=>{setFilters(f=>({...f,[key]:value}));setPage(1);};
  const clear=()=>{setFilters(EMPTY_LIST_FILTERS);setPage(1);};
  const start=(page-1)*pageSize;
  return {query,filters,set,clear,valid,pagination:{page,pageCount,pageSize,start,end:Math.min(start+pageSize,total),total,setPage,setPageSize:(size:number)=>{changeSize(size);setPage(1);},reset:()=>setPage(1)}};
}
