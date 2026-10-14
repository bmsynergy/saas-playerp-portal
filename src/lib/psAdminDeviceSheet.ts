import { supabase } from './supabase';
import { PortalError } from './errors';
import { confirmedAt, validRecoveryWifi } from './psDevice';
import { psErrorFromCode } from './printServerApi';

type Fields<K extends string> = Record<K, string | null>;
type Row = Record<string, unknown>;
export type AdminDeviceSheet = {
  device_id: string;
  device: Fields<'serial'|'hostname'|'model'|'model_label'|'arch'|'label'|'notes'|'created_at'|'updated_at'> & {id:string; status:string; legacy:boolean};
  link: Fields<'print_server_id'|'venue_id'|'venue_name'|'reason'> & {state:string};
  firmware: Fields<'last_reported_version'|'reported_by_print_server_id'|'last_seen_at'|'reason'> & {is_current:boolean};
  credentials: {
    wifi: (Fields<'ssid'|'psk'|'applied_at'|'method'>) | null;
    wifi_reason: string | null;
    admin_code: Fields<'code'|'applied_at'|'method'> | null;
    admin_code_reason: string | null; pending_change:boolean;
  };
  label: {ready:boolean; missing:string[]; label:{device_id:string;serial:string;ssid:string;psk:string;wifi_applied_at:string}|null};
  printers: {items:(Fields<'id'|'label'|'model'|'location'|'last_seen_at'|'venue_id'> & {is_active:boolean})[];reason:string|null};
  scans: {items:(Fields<'command_id'|'print_server_id'|'venue_id'|'status'|'requested_at'|'completed_at'|'error_code'> & {printers_found:number|null})[];reason:string|null};
  jobs: {total:number;by_status:Record<string,number>;recent:(Fields<'id'|'status'|'source_type'|'printer_id'|'venue_id'|'print_server_id'|'created_at'|'completed_at'> & {attempts:number})[];reason:string|null};
  cert: Fields<'status'|'reason'|'print_server_id'|'hostname'|'not_before'|'not_after'|'der_sha256'|'updated_at'> & {is_current:boolean};
  operations: Fields<'command_id'|'print_server_id'|'venue_id'|'command_type'|'status'|'raw_status'|'requested_at'|'received_at'|'completed_at'|'error_code'>[];
  ota: Fields<'target_id'|'print_server_id'|'from_version'|'desired_version'|'installed_version'|'status'|'phase'|'error_code'|'issued_at'|'updated_at'>[];
  assignments: Fields<'print_server_id'|'venue_id'|'venue_name'|'label'|'status'|'created_at'|'enrolled_at'|'revoked_at'|'revoked_reason'|'replaces_print_server_id'|'software_version'|'last_seen_at'>[];
  audit: (Fields<'id'|'action'|'created_at'|'actor_user_id'|'venue_id'|'venue_name'|'reason'|'status'|'error'|'print_server_id'> & {ok:boolean|null})[];
};
const bad = ():never => {throw new PortalError('genericError');};
const obj = (v:unknown):Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : bad();
const str = (v:unknown):string|null => typeof v === 'string' && v.length ? v : null;
const required = (v:unknown):string => str(v) ?? bad();
const count = (v:unknown):number => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
const list = (v:unknown):Row[] => Array.isArray(v) ? v.map(obj) : bad();
function fields<K extends string>(r:Row, keys:K[]):Fields<K> {return Object.fromEntries(keys.map(k=>[k,str(r[k])])) as Fields<K>;}
// Closed projections exclude pending secrets and arbitrary RPC fields. Caller must
// have passed the staff resolver; server remains the authorization boundary.
export function projectAdminDeviceSheet(value:unknown, deviceId:string):AdminDeviceSheet {
  const r=obj(value);
  if(r.ok!==true)throw psErrorFromCode(r.error);
  if(r.sheet_version!==1)return bad();
  const d=obj(r.device);
  if(r.device_id!==deviceId || d.id!==deviceId)throw new PortalError('accessDenied');
  const link=obj(r.link), f=obj(r.firmware), c=obj(r.credentials), l=obj(r.label), p=obj(r.printers), s=obj(r.scans), j=obj(r.jobs), cert=obj(r.cert);
  const confirmed=(value:unknown,keys:('ssid'|'psk'|'code'|'applied_at'|'method')[])=>{
    if(value==null)return null;
    const row=obj(value);
    return confirmedAt(row.applied_at) ? fields(row,keys) : null;
  };
  const wifi=confirmed(c.wifi,['ssid','psk','applied_at','method']) as AdminDeviceSheet['credentials']['wifi'];
  const admin=confirmed(c.admin_code,['code','applied_at','method']) as AdminDeviceSheet['credentials']['admin_code'];
  const rawLabel=l.label==null?null:obj(l.label);
  if(rawLabel && rawLabel.device_id!==deviceId)throw new PortalError('accessDenied');
  const label=rawLabel && l.ready===true && wifi?.ssid && wifi.psk && wifi.applied_at && rawLabel.ssid===wifi.ssid && rawLabel.psk===wifi.psk && rawLabel.serial===d.serial && rawLabel.wifi_applied_at===wifi.applied_at && validRecoveryWifi(wifi.ssid,wifi.psk) && /^PS-[A-Z0-9]{8}$/.test(required(d.serial)) ? {device_id:deviceId,serial:required(rawLabel.serial),ssid:wifi.ssid,psk:wifi.psk,wifi_applied_at:wifi.applied_at}:null;
  return {
    device_id:deviceId,
    device:{...fields(d,['serial','hostname','model','model_label','arch','label','notes','created_at','updated_at']),id:deviceId,status:required(d.status),legacy:d.legacy===true},
    link:{...fields(link,['print_server_id','venue_id','venue_name','reason']),state:required(link.state)},
    firmware:{...fields(f,['last_reported_version','reported_by_print_server_id','last_seen_at','reason']),is_current:f.is_current===true},
    credentials:{wifi,admin_code:admin,wifi_reason:str(c.wifi_reason)??(wifi?null:'wifi_not_confirmed'),admin_code_reason:str(c.admin_code_reason)??(admin?null:'admin_code_not_confirmed'),pending_change:c.pending_change===true},
    label:{ready:!!label,label,missing:Array.isArray(l.missing)?l.missing.filter((x):x is string=>typeof x==='string'):[]},
    printers:{items:list(p.items).map(x=>({...fields(x,['id','label','model','location','last_seen_at','venue_id']),is_active:x.is_active===true})),reason:str(p.reason)},
    scans:{items:list(s.items).map(x=>({...fields(x,['command_id','print_server_id','venue_id','status','requested_at','completed_at','error_code']),printers_found:x.printers_found==null?null:count(x.printers_found)})),reason:str(s.reason)},
    jobs:{total:count(j.total),by_status:Object.fromEntries(Object.entries(obj(j.by_status)).map(([k,v])=>[k,count(v)])),recent:list(j.recent).map(x=>({...fields(x,['id','status','source_type','printer_id','venue_id','print_server_id','created_at','completed_at']),attempts:count(x.attempts)})),reason:str(j.reason)},
    cert:{...fields(cert,['status','reason','print_server_id','hostname','not_before','not_after','der_sha256','updated_at']),is_current:cert.is_current===true},
    operations:list(r.operations).map(x=>fields(x,['command_id','print_server_id','venue_id','command_type','status','raw_status','requested_at','received_at','completed_at','error_code'])),
    ota:list(r.ota).map(x=>fields(x,['target_id','print_server_id','from_version','desired_version','installed_version','status','phase','error_code','issued_at','updated_at'])),
    assignments:list(r.assignments).map(x=>fields(x,['print_server_id','venue_id','venue_name','label','status','created_at','enrolled_at','revoked_at','revoked_reason','replaces_print_server_id','software_version','last_seen_at'])),
    audit:list(r.audit).map(x=>({...fields(x,['id','action','created_at','actor_user_id','venue_id','venue_name','reason','status','error','print_server_id']),ok:typeof x.ok==='boolean'?x.ok:null})),
  };
}
export async function getAdminDeviceSheet(deviceId:string,signal?:AbortSignal):Promise<AdminDeviceSheet> {
  const req=supabase.rpc('ps_admin_device_sheet',{p_device_id:deviceId});
  const {data,error}=await (signal?req.abortSignal(signal):req);
  if(error)throw error;
  return projectAdminDeviceSheet(data,deviceId);
}
