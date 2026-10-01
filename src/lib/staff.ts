import { supabase } from './supabase';
import { errorCode, PortalError } from './errors';
import type { StaffMember } from '../pages/StaffPage';

export class StaffError extends Error {
  constructor(public key: string) { super(key); }
}
const codes: Record<string,string> = {
  cannot_change_self:'staff.cannotChangeSelf', last_super_admin:'staff.lastSuperAdmin',
  invitation_pending:'staff.invitationPending', member_revoked:'staff.memberRevoked',
  member_not_found:'staff.memberNotFound', already_active:'staff.alreadyActive',
};
export function staffErrorKey(error: unknown) { return error instanceof StaffError ? error.key : errorCode(error); }
export function staffRequest(name: 'platform-staff-admin'|'invite-platform-staff', body: Record<string,unknown>) { return invokeFunction(name,body,codes); }
// Shared by every admin edge function: known error slugs become localized keys,
// anything else collapses to a safe status-based message.
export async function invokeFunction(name: 'platform-staff-admin'|'invite-platform-staff'|'platform-identity-admin', body: Record<string,unknown>, codes: Record<string,string>) {
  const {data,error}=await supabase.functions.invoke(name,{body});
  if (error) {
    const response=error.context instanceof Response ? error.context : null;
    let code='';
    if (response) {
      try { const json=await response.clone().json(); code=String(json.error??''); } catch { /* generic safe message */ }
      if (codes[code]) throw new StaffError(codes[code]);
      throw new PortalError(errorCode({status:response.status}));
    }
    throw error;
  }
  if (!data || data.error) throw new PortalError('genericError');
  return data;
}
export async function getStaff(): Promise<StaffMember[]> {
  const data=await staffRequest('platform-staff-admin',{action:'list'});
  if (!Array.isArray(data.members)) throw new PortalError('genericError');
  return data.members.map((m: Record<string,unknown>)=>{
    if (typeof m.user_id!=='string'||typeof m.email!=='string'||!['super_admin','support','operations'].includes(String(m.role))||!['active','invited','revoked'].includes(String(m.status))) throw new PortalError('genericError');
    const str=(v:unknown)=>typeof v==='string'?v:null;
    return {user_id:m.user_id,email:m.email,full_name:str(m.full_name),role:m.role,status:m.status,active:m.active===true,invited_at:str(m.invited_at),accepted_at:str(m.accepted_at),created_at:str(m.created_at),last_sign_in_at:str(m.last_sign_in_at),is_self:m.is_self===true} as StaffMember;
  });
}
export async function acceptInvitation() {
  const {data,error}=await supabase.rpc('accept_platform_invitation');
  if (error) {
    if (error.code==='P0002') throw new StaffError('staff.noInvitation');
    throw error;
  }
  if (!data || !['accepted','already_active'].includes(data.status)) throw new PortalError('genericError');
}
