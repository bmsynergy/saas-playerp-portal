import { supabase } from './supabase';
import type { AdminVenueOption } from './psAdminDevice';
export type MaintenanceTask = { key:string; status:string; duration_ms:number|null; resolved:number|null; error:unknown; detail:Record<string,number> };
export type MaintenanceExecution = { attempt:number; current:boolean; ran_at:string|null; status:string; duration_ms:number|null; trigger:string|null; resolved:number|null; failed_tasks:string[]; error:unknown; tasks:MaintenanceTask[] };
export type MaintenanceNight = { local_date:string; required:boolean; status:string; problem:string|null; run_id:string|null; ran_at:string|null; duration_ms:number|null; resolved:number|null; failed_tasks:string[]; error:unknown; attempts:number; executions:MaintenanceExecution[]; watch:null|{status:string; alerted_at:string|null; email:{dispatched?:boolean;skipped?:string}; webhook_sent:boolean} };
export type MaintenanceVenue = {venue_id:string; venue_name:string; timezone:string; required_since:string; today_local:string; problems:number; last_success_date:string|null; nights:MaintenanceNight[]};
export type MaintenanceProblem = {venue_id:string; venue_name:string; local_date:string; kind:string; status:string; run_id:string|null; attempts:number; failed_tasks:string[]; error:unknown; watch_status:string|null; email_skipped:string|null; webhook_sent:boolean|null};
export type MaintenanceOverview = {as_of:string; days:number; total:number; page:number; page_size:number; pages:number; problems_total:number; summary:{venues:number; venues_with_problems:number; problem_nights:number; alert_recipients:number}; problems:MaintenanceProblem[]; venues:MaintenanceVenue[]};
export type MaintenanceCandidate = {user_id:string; email:string; name:string|null; role:string};
export type MaintenanceRecipient = MaintenanceCandidate & {active:boolean; effective:boolean; added_at:string; added_by_email:string|null};
export type MaintenanceRecipients = {recipients:MaintenanceRecipient[]; candidates:MaintenanceCandidate[]; effective_count:number; candidates_has_more:boolean};
async function rpc<T>(name:string, params:Record<string,unknown>, signal?:AbortSignal):Promise<T> {
  const request=supabase.rpc(name,params);
  const {data,error}=await(signal?request.abortSignal(signal):request);
  if(error)throw error;
  if(!data)throw new Error('invalid_maintenance_response');
  return data as T;
}
export function getMaintenanceOverview(days:number,venueId:string|null,page:number,signal?:AbortSignal){return rpc<MaintenanceOverview>('portal_system_maintenance_overview',{p_days:days,p_venue_id:venueId,p_page:page,p_page_size:25},signal);}
export function getMaintenanceRecipients(signal?:AbortSignal){return rpc<MaintenanceRecipients>('portal_maintenance_alert_recipients',{p_query:null,p_limit:20},signal);}
export function setMaintenanceRecipient(userId:string,enabled:boolean){return rpc<MaintenanceRecipients>('portal_maintenance_alert_recipient_set',{p_user_id:userId,p_enabled:enabled});}

export function searchMaintenanceRecipients(query:string,signal?:AbortSignal){
  return rpc<MaintenanceRecipients>('portal_maintenance_alert_recipients',{p_query:query.trim()||null,p_limit:20},signal);
}
export async function searchMaintenanceVenues(query:string,_includeVenueId?:string,signal?:AbortSignal):Promise<AdminVenueOption[]>{
  const data=await rpc<{venues:{venue_id:string;venue_name:string;timezone:string}[]}>('portal_maintenance_venue_search',{p_query:query.trim()||null,p_limit:20},signal);
  return data.venues.map(venue=>({id:venue.venue_id,name:venue.venue_name,slug:null,city:null,state:null,is_active:true,assigned_device:null}));
}
