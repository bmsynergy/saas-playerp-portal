import { supabase } from './supabase';
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from './config';
import { PortalError } from './errors';

export type StockState = 'not_prepared'|'file_issued'|'file_expired'|'file_invalid'|'enrolled_pending_confirmation'|'validated_in_stock'|'validated_assigned'|'retired';
export type StockStatus = { ok:true; device_id:string; serial:string; model:string; arch:string; lifecycle:string; legacy:boolean; venue_id:string|null; link_state:string;
  stock:{state:StockState;next_step:string|null;label_ready:boolean;missing:string[];checks:Record<string,boolean>;
    credential:{print_server_id:string;enrolled_at:string;permanent:boolean;credential_hint_present:boolean}|null;
    reported:{hostname:string|null;firmware_version:string|null;setup_url:string|null;last_status_at:string|null;last_seen_at:string|null};
    file:{file_id:string;instance_id:string;issued_at:string;expires_at:string;sha256:string;bytes:number;superseded_at:string|null;consumed_by_device:boolean}|null}};
export type StockLabel = {device_id:string;serial:string;ssid:string;psk:string;local_address:string;wifi_qr:string};
export type DeliveryEmailResult = {ok:true;mode?:'preview'|'send';sent:boolean;sendable?:boolean;held?:boolean;held_reason?:string|null;email?:{to:string;subject:string;text?:string;html?:string}};
type Raw=Record<string,any>;
function checked(value:unknown):Raw {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new PortalError('genericError');
  const data=value as Raw;
  if(data.ok!==true)throw new PortalError(data.error==='forbidden'?'accessDenied':'genericError');
  return data;
}
async function rpc(name:string,id:string):Promise<Raw>{
  const {data,error}=await supabase.rpc(name,{p_device_id:id});
  if(error)throw new PortalError(error.code==='42501'?'accessDenied':'genericError');
  return checked(data);
}
async function post(body:Raw):Promise<Raw>{
  const {data}=await supabase.auth.getSession();const token=data.session?.access_token;
  if(!token)throw new PortalError('sessionExpired');
  let response:Response;
  try{response=await fetch(`${SUPABASE_URL}/functions/v1/ps-firmware-admin`,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:SUPABASE_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});}
  catch{throw new PortalError('networkError');}
  if(response.status===401)throw new PortalError('sessionExpired');
  if(response.status===403)throw new PortalError('accessDenied');
  const out=checked(await response.json().catch(()=>null));
  if(!response.ok)throw new PortalError('genericError');
  return out;
}
const states:StockState[]=['not_prepared','file_issued','file_expired','file_invalid','enrolled_pending_confirmation','validated_in_stock','validated_assigned','retired'];
export function projectStockStatus(data:Raw,id:string):StockStatus {
  if(data.device_id!==id||typeof data.serial!=='string'||!data.stock||!states.includes(data.stock.state)||typeof data.stock.label_ready!=='boolean'||!data.stock.reported||!Array.isArray(data.stock.missing)||!data.stock.checks)throw new PortalError('genericError');
  return data as StockStatus;
}
export async function getStockStatus(id:string):Promise<StockStatus>{return projectStockStatus(await rpc('ps_admin_stock_status',id),id);}
export async function getStockLabel(id:string):Promise<StockLabel>{
  const {label}=await rpc('ps_admin_stock_label',id);
  if(!label||label.device_id!==id||!['serial','ssid','psk','local_address','wifi_qr'].every(key=>typeof label[key]==='string'&&label[key]))throw new PortalError('genericError');
  // Closed projection: maintenance credentials never reach the label view.
  return {device_id:id,serial:label.serial,ssid:label.ssid,psk:label.psk,local_address:label.local_address,wifi_qr:label.wifi_qr};
}
export async function verifyStockFile(data:Raw,id:string):Promise<Uint8Array>{
  if(data.device_id!==id||data.filename!=='playerp-device.json'||typeof data.content!=='string'||typeof data.sha256!=='string')throw new PortalError('genericError');
  const bytes=new TextEncoder().encode(data.content);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==data.sha256||bytes.byteLength!==data.bytes)throw new PortalError('genericError');
  return bytes;
}
export async function downloadStockFile(id:string):Promise<{sha256:string;bytes:number;expires_at:string}>{
  const data=await post({action:'stock_file',id});const bytes=await verifyStockFile(data,id);
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));
  try{const anchor=document.createElement('a');anchor.href=url;anchor.download='playerp-device.json';document.body.appendChild(anchor);anchor.click();anchor.remove();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return {sha256:data.sha256,bytes:data.bytes,expires_at:data.expires_at};
}
function emailResult(data:Raw):DeliveryEmailResult {
  if(typeof data.sent!=='boolean')throw new PortalError('genericError');
  return {ok:true,mode:data.mode,sent:data.sent,sendable:data.sendable===true,held:data.held===true,held_reason:typeof data.held_reason==='string'?data.held_reason:null,
    email:data.email?{to:String(data.email.to),subject:String(data.email.subject),text:typeof data.email.text==='string'?data.email.text:undefined}:undefined};
}
export async function previewDeliveryEmail(id:string,to:string,locale:string):Promise<DeliveryEmailResult>{return emailResult(await post({action:'delivery_email',id,to,locale}));}
export async function sendDeliveryEmail(id:string,to:string,locale:string,serial:string):Promise<DeliveryEmailResult>{return emailResult(await post({action:'delivery_email',id,to,locale,send:true,confirm_serial:serial}));}

export type StockReservedCredentials = {
  device_id:string; serial:string; status:'reserved_pending_confirmation'|'confirmed_by_device';
  confirmed_by_device:boolean; state:StockState; next_step:string|null; label_ready:boolean;
  reserved:{ssid:string;psk:string;admin_code:string};
  confirmed_at:{wifi:string;admin_code:string}|null;
  file:{file_id:string;sha256:string;issued_at:string;expires_at:string};
};
export function projectStockReservedCredentials(value:unknown,id:string):StockReservedCredentials {
  const d=checked(value);
  const confirmed=d.status==='confirmed_by_device';
  const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&!/pse_|pst_|-----BEGIN .*PRIVATE KEY/.test(v);
  if(d.device_id!==id||!text(d.serial)||!['reserved_pending_confirmation','confirmed_by_device'].includes(d.status)
    ||d.confirmed_by_device!==confirmed||!states.includes(d.state)||typeof d.label_ready!=='boolean'
    ||(!confirmed&&d.label_ready)||!(d.next_step===null||text(d.next_step))
    ||!d.reserved||!['ssid','psk','admin_code'].every(k=>text(d.reserved[k]))
    ||!d.file||!['file_id','sha256','issued_at','expires_at'].every(k=>text(d.file[k]))
    ||(confirmed?(!d.confirmed_at||!text(d.confirmed_at.wifi)||!text(d.confirmed_at.admin_code)):d.confirmed_at!==null))throw new PortalError('genericError');
  // Only human-facing setup credentials cross this boundary. Never retain a raw RPC response.
  return {device_id:id,serial:d.serial,status:d.status,confirmed_by_device:confirmed,state:d.state,next_step:d.next_step,label_ready:d.label_ready,
    reserved:{ssid:d.reserved.ssid,psk:d.reserved.psk,admin_code:d.reserved.admin_code},
    confirmed_at:confirmed?{wifi:d.confirmed_at.wifi,admin_code:d.confirmed_at.admin_code}:null,
    file:{file_id:d.file.file_id,sha256:d.file.sha256,issued_at:d.file.issued_at,expires_at:d.file.expires_at}};
}
export async function getStockReservedCredentials(id:string):Promise<StockReservedCredentials>{
  return projectStockReservedCredentials(await rpc('ps_admin_stock_reserved_credentials',id),id);
}
