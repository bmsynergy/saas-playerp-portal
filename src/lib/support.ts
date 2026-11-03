import { supabase } from './supabase';
import { PortalError } from './errors';
export type SupportScope = 'venue'|'platform';
export type SupportStatus = 'open'|'in_progress'|'waiting_tenant'|'resolved'|'closed';
export type SupportPriority = 'low'|'normal'|'high'|'urgent';
export type SupportFilters = {query:string;venueId:string;status:string;category:string;priority:string;assigned:string;minAgeHours:string;unreadOnly:boolean;pendingOnly:boolean;sort:string;page:number};
export const defaultSupportFilters:SupportFilters={query:'',venueId:'',status:'',category:'',priority:'',assigned:'',minAgeHours:'',unreadOnly:false,pendingOnly:false,sort:'last_activity',page:1};
export type SupportTicket={id:string;venue_id:string;venue_name:string;subject:string;category:string;priority:SupportPriority;status:SupportStatus;created_by:string;created_by_name:string|null;created_at:string;updated_at:string;last_message_at:string|null;last_message_scope:string|null;age_hours:number;message_count?:number;unread?:boolean;pending?:boolean;assigned_to?:string|null;assigned_name?:string|null;internal_note_count?:number;can_reply?:boolean;allowed_statuses?:SupportStatus[]};
export type SupportMessage={id:string;author_name:string|null;author_scope:'tenant'|'platform';body:string;created_at:string;unread:boolean;is_internal?:boolean};
export type SupportList={scope:SupportScope;total:number;page:number;page_size:number;pages:number;items:SupportTicket[];summary:Record<string,number>};
export type SupportDetail={scope:SupportScope;ticket:SupportTicket;messages:SupportMessage[]};
export type SupportStaff={user_id:string;name:string|null;email:string;role:string};
export type SupportCounts={totals:Record<string,number>;venues:{venue_id:string;venue_name:string;active:number;open:number;in_progress:number;waiting_tenant:number;pending:number;unread:number}[]};
async function rpc<T>(name:string,params:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
 const request=supabase.rpc(name,params);const {data,error}=await(signal?request.abortSignal(signal):request);
 if(error)throw error;if(data===null)throw new PortalError('genericError');return data as T;
}
export async function getSupportList(scope:SupportScope,filters:SupportFilters,venueId?:string,signal?:AbortSignal){
 const data=await rpc<SupportList>('support_ticket_list',{p_scope:scope,p_venue_ids:venueId?[venueId]:filters.venueId?[filters.venueId]:null,p_status:filters.status?[filters.status]:null,p_category:filters.category||null,p_priority:filters.priority?[filters.priority]:null,p_assigned:scope==='platform'?filters.assigned||null:null,p_query:filters.query.trim()||null,p_min_age_hours:filters.minAgeHours?Number(filters.minAgeHours):null,p_unread_only:filters.unreadOnly,p_pending_only:filters.pendingOnly,p_sort:filters.sort,p_page:filters.page,p_page_size:25},signal);
 if(data.scope!==scope||!Array.isArray(data.items)||data.items.some(t=>venueId&&t.venue_id!==venueId))throw new PortalError('accessDenied');return data;
}
export async function getSupportDetail(scope:SupportScope,id:string,venueId?:string,signal?:AbortSignal){
 const data=await rpc<SupportDetail>('support_ticket_detail',{p_scope:scope,p_ticket_id:id,p_mark_read:true},signal);
 if(data.scope!==scope||data.ticket?.id!==id||(venueId&&data.ticket.venue_id!==venueId))throw new PortalError('accessDenied');
 if(scope==='venue')data.messages=data.messages.filter(m=>!m.is_internal);return data;
}
export const getSupportStaff=(signal?:AbortSignal)=>rpc<SupportStaff[]>('support_assignable_staff',{},signal);
export const getSupportCounts=(scope:SupportScope,venueId?:string,signal?:AbortSignal)=>rpc<SupportCounts>('support_venue_counts',{p_scope:scope,p_venue_ids:venueId?[venueId]:null},signal);
async function edge(name:string,body:Record<string,unknown>){
 const {data,error}=await supabase.functions.invoke(name,{body});
 if(error){const status=(error as {context?:{status?:number}}).context?.status;throw new PortalError(status===401?'sessionExpired':status===403?'accessDenied':'genericError');}
 if(data?.error)throw new PortalError('genericError');return data as {email_sent?:boolean;email_error?:string};
}
export const replySupport=(id:string,body:string)=>edge('reply-support-ticket',{ticket_id:id,body});
export const setSupportStatus=(id:string,status:string)=>edge('update-support-ticket-status',{ticket_id:id,status});
export const assignSupport=(id:string,assignee:string|null)=>edge('support-ticket-assign',{ticket_id:id,assignee_id:assignee});
export const prioritizeSupport=(id:string,priority:string)=>rpc('support_ticket_set_priority',{p_ticket_id:id,p_priority:priority});
export const noteSupport=(id:string,body:string)=>rpc('support_ticket_add_internal_note',{p_ticket_id:id,p_body:body});
