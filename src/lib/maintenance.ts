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


export type MaintenanceVenueSummary = Omit<MaintenanceVenue, 'problems' | 'nights'> & {
  problem_nights: number;
  last_night: {local_date: string; status: string; problem: string | null} | null;
};
export type MaintenanceVenueList = {
  as_of: string; query: string | null; days: number;
  total: number; page: number; page_size: number; pages: number;
  summary: MaintenanceOverview['summary'] & {venues_last_night_problem: number};
  venues: MaintenanceVenueSummary[];
};
export type MaintenanceVenueRuns = {
  as_of: string; venue: Omit<MaintenanceVenue, 'problems' | 'nights'>;
  from: string; to: string; range_clamped: boolean;
  status: string | null; task: string | null; order: 'asc' | 'desc';
  task_keys: string[]; counts: Record<string, number>;
  total: number; page: number; page_size: number; pages: number; nights: MaintenanceNight[];
};
export type MaintenanceRunFilters = {from: string; to: string; status: string; task: string; order: 'asc' | 'desc'; page: number};
const validDate = (value: string | null): string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
};
export function maintenanceRunFilters(params: URLSearchParams): MaintenanceRunFilters {
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  return {from: validDate(params.get('from')), to: validDate(params.get('to')),
    status: ['success', 'error', 'missing', 'running', 'problem'].includes(status) ? status : '',
    task: params.get('task') ?? '', order: params.get('order') === 'asc' ? 'asc' : 'desc',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1};
}
export function getMaintenanceVenueList(query: string, days: number, page: number, signal?: AbortSignal) {
  return rpc<MaintenanceVenueList>('portal_maintenance_venue_list', {p_query: query.trim() || null, p_days: days, p_page: page, p_page_size: 25}, signal);
}
export function getMaintenanceVenueRuns(venueId: string, filters: MaintenanceRunFilters, signal?: AbortSignal) {
  return rpc<MaintenanceVenueRuns>('portal_maintenance_venue_runs', {p_venue_id: venueId, p_from: filters.from || null,
    p_to: filters.to || null, p_status: filters.status || null, p_task: filters.task || null,
    p_order: filters.order, p_page: filters.page, p_page_size: 25}, signal);
}
