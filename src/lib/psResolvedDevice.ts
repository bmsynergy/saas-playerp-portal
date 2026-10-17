import { supabase } from './supabase';
import { PortalError } from './errors';
import { PsLinkError, projectPsLink, type PsDeviceLink } from './psLink';

type Row = Record<string, unknown>;
export type PsCapability = { required_version: string; supported: boolean | null; available: {version:string; edition_id:string; enabled_rings:string[]; retired:boolean}[] };
export type PsCompat = {installed_version:string|null; capabilities:Record<'link_ack'|'unlink_ack'|'web_activation',PsCapability>};
export type ResolvedDevice = {
  requested_id:string; resolved_via:'device_id'|'runtime_id'; device_id:string; canonical_path:string;
  serial:string; display_name:string; label:string|null; model:string; legacy:boolean; lifecycle:string;
  venue:{id:string;name:string}|null;
  runtime:{print_server_id:string;status:string;venue_id:string|null;hostname:string|null;firmware_version:string|null;last_seen_at:string|null;online:boolean}|null;
  requested_runtime:{print_server_id:string;status:string;is_current:boolean}|null;
  link:PsDeviceLink; compat:PsCompat; is_staff:boolean; can_manage:boolean;
  capabilities:{
    unlink:{allowed:boolean;reason:string|null;expected_rev:number|null;semantics:string;removes:string[];preserves:string[];device_ack:{capability:string;required_version:string}};
    revoke:{allowed:boolean;semantics:string}; prepare:{allowed:boolean}; assign:{allowed:boolean}; move:{allowed:boolean}; set_label:{allowed:boolean};
  };
  preparation_entry:{web:{url:string;section:string;field:string;endpoint:string;required_version:string;requires:string[]};ssh:{command:string;required_version:string;requires:string[]}};
};
const bad=():never=>{throw new PortalError('genericError');};
const obj=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:bad();
const str=(v:unknown):string|null=>typeof v==='string'&&v.length?v:null;
const required=(v:unknown)=>str(v)??bad();
const strings=(v:unknown):string[]=>Array.isArray(v)?v.filter((s):s is string=>typeof s==='string'):[];
const number=(v:unknown):number|null=>typeof v==='number'&&Number.isInteger(v)&&v>=0?v:null;
function checked(v:unknown):Row {
  const r=obj(v);
  if(r.ok!==true)throw new PsLinkError(str(r.error)??'other',str(r.message),str(r.next_step));
  return r;
}
async function rpc(name:string,params:Row,signal?:AbortSignal) {
  const req=supabase.rpc(name,params);
  const {data,error}=await(signal?req.abortSignal(signal):req);
  if(error){if(error.code==='42501')throw new PsLinkError('forbidden',null,'ask_platform_admin');throw error;}
  return checked(data);
}
// Project only the published DTO. Cross-device or mismatched runtime responses fail closed.
export function projectResolvedDevice(value:unknown,requestedId:string):ResolvedDevice {
  const r=checked(value), id=required(r.device_id), link=projectPsLink(r.link);
  const rt=r.runtime==null?null:obj(r.runtime), requested=r.requested_runtime==null?null:obj(r.requested_runtime);
  if(r.requested_id!==requestedId || !link || link.device_id!==id || (id!==requestedId&&requested?.print_server_id!==requestedId))throw new PortalError('accessDenied');
  if((rt?.print_server_id??null)!==link.print_server_id)throw new PortalError('accessDenied');
  const v=r.venue==null?null:obj(r.venue);
  if((v?.id??null)!==link.venue_id || (rt&&rt.venue_id!==(v?.id??null)))throw new PortalError('accessDenied');
  const c=obj(r.compat), caps=obj(c.capabilities), actions=obj(r.capabilities), unlink=obj(actions.unlink), ack=obj(unlink.device_ack);
  const capability=(key:string):PsCapability=>{const a=obj(caps[key]);return {required_version:required(a.required_version),supported:typeof a.supported==='boolean'?a.supported:null,available:Array.isArray(a.available)?a.available.map(x=>{const e=obj(x);return {version:required(e.version),edition_id:required(e.edition_id),enabled_rings:strings(e.enabled_rings),retired:e.retired===true};}):[]};};
  const entry=obj(r.preparation_entry), web=obj(entry.web), ssh=obj(entry.ssh);
  const canonical=`/admin/print-servers/devices/${encodeURIComponent(id)}`;
  if(r.canonical_path!==canonical)throw new PortalError('accessDenied');
  return {
    requested_id:requestedId,resolved_via:r.resolved_via==='runtime_id'?'runtime_id':'device_id',device_id:id,canonical_path:canonical,
    serial:required(r.serial),display_name:required(r.display_name),label:str(r.label),model:required(r.model),legacy:r.legacy===true,lifecycle:required(r.lifecycle),
    venue:v?{id:required(v.id),name:required(v.name)}:null,
    runtime:rt?{print_server_id:required(rt.print_server_id),status:required(rt.status),venue_id:str(rt.venue_id),hostname:str(rt.hostname),firmware_version:str(rt.firmware_version),last_seen_at:str(rt.last_seen_at),online:rt.online===true}:null,
    requested_runtime:requested?{print_server_id:required(requested.print_server_id),status:required(requested.status),is_current:requested.is_current===true}:null,
    link,compat:{installed_version:str(c.installed_version),capabilities:{link_ack:capability('link_ack'),unlink_ack:capability('unlink_ack'),web_activation:capability('web_activation')}},
    is_staff:r.is_staff===true,can_manage:r.can_manage===true,
    capabilities:{unlink:{allowed:unlink.allowed===true,reason:str(unlink.reason),expected_rev:number(unlink.expected_rev),semantics:required(unlink.semantics),removes:strings(unlink.removes),preserves:strings(unlink.preserves),device_ack:{capability:required(ack.capability),required_version:required(ack.required_version)}},
      revoke:{allowed:obj(actions.revoke).allowed===true,semantics:required(obj(actions.revoke).semantics)},
      prepare:{allowed:obj(actions.prepare).allowed===true},assign:{allowed:obj(actions.assign).allowed===true},move:{allowed:obj(actions.move).allowed===true},set_label:{allowed:obj(actions.set_label).allowed===true}},
    preparation_entry:{web:{url:required(web.url),section:required(web.section),field:required(web.field),endpoint:required(web.endpoint),required_version:required(web.required_version),requires:strings(web.requires)},ssh:{command:required(ssh.command),required_version:required(ssh.required_version),requires:strings(ssh.requires)}},
  };
}
export async function getResolvedDevice(id:string,signal?:AbortSignal):Promise<ResolvedDevice>{return projectResolvedDevice(await rpc('ps_device_resolve',{p_id:id},signal),id);}
export async function unlinkDevice(deviceId:string,expectedRev:number,reason?:string):Promise<{already_unlinked:boolean;device_id:string;link:PsDeviceLink}> {
  const r=await rpc('ps_admin_device_unlink',{p_device_id:deviceId,p_expected_rev:expectedRev,p_reason:reason??null}),link=projectPsLink(r.link);
  if(!link||link.device_id!==deviceId||(r.device_id!=null&&r.device_id!==deviceId))throw new PortalError('accessDenied');
  return {already_unlinked:r.already_unlinked===true,device_id:deviceId,link};
}
