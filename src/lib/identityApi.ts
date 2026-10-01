import { PortalError } from './errors';
import { invokeFunction } from './staff';
import type { IdentityDetail, IdentityDirectory, IdentityStatus, IdentityUser, IdentityVenue } from './identity';

const codes: Record<string,string> = {
  cannot_change_self:'identity.error.cannotChangeSelf', protected_super_admin:'identity.error.protected',
  user_not_found:'identity.error.userNotFound', not_staff:'identity.error.notStaff', already_staff:'identity.error.alreadyStaff',
  invalid_role:'identity.error.invalidRole', invalid_venues:'identity.error.invalidVenues', invalid_email:'invalidEmail',
  invalid_name:'identity.error.invalidName', invite_send_failed:'identity.error.inviteSendFailed', recovery_send_failed:'identity.error.recoverySendFailed',
};
const str = (v: unknown) => typeof v === 'string' ? v : null;
const bad = (): never => { throw new PortalError('genericError'); };
function venue(v: unknown): IdentityVenue {
  const item = v as Record<string,unknown> | null;
  return item && typeof item.id === 'string' && typeof item.name === 'string' ? {id:item.id,name:item.name} : bad();
}
function user(v: unknown): IdentityUser {
  const u = v as Record<string,unknown> | null;
  if (!u || typeof u.user_id !== 'string' || typeof u.email !== 'string' || !['active','invited','revoked'].includes(String(u.status)) || !Array.isArray(u.venues)) return bad();
  return {user_id:u.user_id,email:u.email,full_name:str(u.full_name),role:str(u.role),status:u.status as IdentityStatus,venues:u.venues.map(venue),
    all_venues:u.all_venues===true,protected:u.protected===true,platform_role:str(u.platform_role),last_sign_in_at:str(u.last_sign_in_at),created_at:str(u.created_at),is_self:u.is_self===true};
}
export function identityRequest(body: Record<string,unknown>) { return invokeFunction('platform-identity-admin',body,codes); }
export async function getIdentities(): Promise<IdentityDirectory> {
  const data=await identityRequest({action:'list'});
  if (!Array.isArray(data.users) || !Array.isArray(data.venues) || !Array.isArray(data.roles)) return bad();
  return {users:data.users.map(user),
    venues:data.venues.map((v: Record<string,unknown>)=>({...venue(v),is_active:typeof v.is_active==='boolean'?v.is_active:null})),
    // The platform never assigns the legacy venue super admin from here.
    roles:data.roles.filter((role: unknown): role is string=>typeof role==='string'&&role!=='super_admin')};
}
export async function getIdentity(id: string): Promise<IdentityDetail> {
  const data=await identityRequest({action:'detail',user_id:id});
  if (!Array.isArray(data.audit)) return bad();
  return {user:user(data.user),audit:data.audit.map((a: Record<string,unknown>)=>typeof a?.id==='string'&&typeof a.action==='string'&&typeof a.created_at==='string'?{id:a.id,action:a.action,created_at:a.created_at,actor_email:str(a.actor_email)}:bad())};
}
