import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../locales';
import { queryClient } from '../lib/queryClient';
import { errorCode } from '../lib/errors';
import type { OwnerVenue } from '../lib/types';
import { searchMaintenanceVenues } from '../lib/maintenance';
import { SupportPage } from '../pages/SupportPage';
import { assignSupport, defaultSupportFilters, getSupportCounts, getSupportDetail, getSupportList, getSupportStaff, noteSupport, prioritizeSupport, replySupport, setSupportStatus, type SupportFilters, type SupportScope } from '../lib/support';

export function SupportRoute({scope,venueId,venues=[]}:{scope:SupportScope;venueId?:string;venues?:OwnerVenue[]}){
 const {session,expire}=useAuth();const {t,locale}=useLocale();
 const [filters,setFilters]=useState<SupportFilters>({...defaultSupportFilters});
 const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);
 const [mutationError,setMutationError]=useState<string|null>(null);const [notice,setNotice]=useState<string|null>(null);
 const mutationLock=useRef(false);
 const list=useQuery({queryKey:['support','list',session?.user.id,scope,venueId,filters],queryFn:({signal})=>getSupportList(scope,filters,venueId,signal),retry:false,gcTime:0,refetchInterval:60000});
 const staff=useQuery({queryKey:['support','staff',session?.user.id],queryFn:({signal})=>getSupportStaff(signal),enabled:scope==='platform',retry:false,gcTime:0});
 const detail=useQuery({queryKey:['support','detail',session?.user.id,scope,venueId,selected],queryFn:async({signal})=>{
   const data=await getSupportDetail(scope,selected,venueId,signal);
   void queryClient.invalidateQueries({queryKey:['support','list']});void queryClient.invalidateQueries({queryKey:['support','counts']});return data;
 },enabled:!!selected,retry:false,gcTime:0});
 useEffect(()=>{if([list.error,staff.error,detail.error].some(e=>e&&errorCode(e)==='sessionExpired'))void expire();},[list.error,staff.error,detail.error,expire]);
 const run=async(action:()=>Promise<unknown>)=>{
   if(mutationLock.current)throw new Error('busy');mutationLock.current=true;setBusy(true);setMutationError(null);setNotice(null);
   try{const result=await action() as {email_sent?:boolean;email_error?:string}|null;
     setNotice(locale==='es'?'Cambio guardado.':'Change saved.');
     if(result?.email_error)setNotice(locale==='es'?'Cambio guardado, pero no se pudo enviar el correo.':'Change saved, but the email could not be sent.');
     await queryClient.invalidateQueries({queryKey:['support']});
   }catch(error){setMutationError(t(errorCode(error)));if(errorCode(error)==='sessionExpired')void expire();throw error;}
   finally{mutationLock.current=false;setBusy(false);}
 };
 const change=(patch:Partial<SupportFilters>)=>{setFilters(current=>({...current,...patch,page:patch.page??1}));};
 return <SupportPage scope={scope} venueName={venues.find(v=>v.id===venueId)?.name} venueOptions={venueId?[]:venues.map(v=>({id:v.id,name:v.name}))}
   venueSearch={scope==='platform'?searchMaintenanceVenues:undefined} filters={filters} onFiltersChange={change} list={list.data}
   loading={list.isFetching} error={list.error?t(errorCode(list.error)):null} onRetry={()=>void list.refetch()}
   onOpen={id=>{if(!busy){setSelected(id);setMutationError(null);setNotice(null);}}} onPageChange={page=>change({page})}
   selectedTicketId={selected} detail={detail.isError?undefined:detail.data} detailLoading={!!selected&&detail.isFetching} detailError={detail.error?t(errorCode(detail.error)):null}
   onDetailRetry={()=>void detail.refetch()} onCloseThread={()=>{if(!busy){setSelected('');setMutationError(null);setNotice(null);}}}
   onReply={(body,internal)=>run(()=>internal&&scope==='platform'?noteSupport(selected,body):replySupport(selected,body))}
   onStatus={status=>run(()=>setSupportStatus(selected,status))} onAssign={id=>run(()=>assignSupport(selected,id))} onPriority={priority=>run(()=>prioritizeSupport(selected,priority))}
   assignableStaff={staff.data} staffError={staff.error?t(errorCode(staff.error)):null} onStaffRetry={()=>void staff.refetch()}
   mutationBusy={busy} mutationError={mutationError} mutationNotice={notice}/>;
}
export function SupportOverview({venues=[],venueId,scope='venue'}:{venues?:OwnerVenue[];venueId?:string;scope?:SupportScope}){
 const {session}=useAuth();const {locale,t}=useLocale();const es=locale==='es';
 const counts=useQuery({queryKey:['support','counts',session?.user.id,scope,venueId],queryFn:({signal})=>getSupportCounts(scope,venueId,signal),retry:false,gcTime:0,refetchInterval:60000});
 const href=scope==='platform'?'/admin/support':venueId?`/?venue=${venueId}&section=support`:'/?section=support';
 return <section className="panel" style={{padding:24}} aria-label="Support"><div className="section-heading"><h2>Support</h2><Link className="button button-secondary" to={href}>{es?'Ver tickets':'View tickets'}</Link></div>
 {counts.isPending?<p role="status">{es?'Cargando soporte…':'Loading support…'}</p>:counts.isError?<div role="alert">{t(errorCode(counts.error))} <button className="button button-secondary" onClick={()=>void counts.refetch()}>{es?'Reintentar':'Retry'}</button></div>:<>
 <p>{es?'Activos':'Active'}: <strong>{counts.data.totals.active??0}</strong> · {es?'Pendientes de tu respuesta':'Awaiting your reply'}: <strong>{counts.data.totals.pending??0}</strong> · {es?'No leídos':'Unread'}: <strong>{counts.data.totals.unread??0}</strong></p>
 {scope==='venue'&&!venueId&&counts.data.venues.filter(v=>venues.some(venue=>venue.id===v.venue_id)).map(v=><p key={v.venue_id}><Link to={`/?venue=${v.venue_id}&section=support`}>{v.venue_name}</Link> — {v.active} {es?'activos':'active'} · {v.pending} {es?'pendientes':'pending'} · {v.unread} {es?'no leídos':'unread'}</p>)}
 </>}
 </section>;
}
