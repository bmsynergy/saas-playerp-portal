import { PortalError } from './errors';
import { invokeFunction } from './staff';

// The owner manages the members of ONE venue. The backend decides on every call
// that the caller owns that venue; nothing here grants anything.
export type OwnerUserStatus = 'active' | 'invited' | 'inactive';
export type OwnerOperation = 'appoint' | 'demote' | 'remove';
export type OwnerUser = {
  user_id: string; email: string; full_name: string | null;
  // Role and portal access in this venue only.
  role: string; status: OwnerUserStatus; portal_access: boolean;
  member_since: string | null; is_self: boolean;
  // Locks apply to ordinary role/access edits; owner changes use owner_actions.
  locked: 'self' | 'owner' | 'super_admin' | null;
  owner_actions: OwnerOperation[];
};
export type OwnerUsers = { venue: { id: string; name: string }; users: OwnerUser[]; roles: string[]; invite_roles: string[]; owner_count: number | null };
export type OwnerUserAction = 'set_role' | 'set_portal_access';
export type OwnerUserInvite = { email: string; first_name: string; last_name: string; role: string; locale: 'en' | 'es'; confirm?: true };

// Every slug of the owner-venue-users contract maps to a localized key.
export const ownerUserCodes: Record<string,string> = {
  unauthorized:'sessionExpired', forbidden:'accessDenied', rate_limited:'rateLimited', server_error:'genericError',
  user_not_found:'identity.error.userNotFound', not_member:'identity.error.notMember',
  cannot_change_self:'identity.error.cannotChangeSelf', protected_owner:'ownerUsers.error.protectedOwner',
  protected_super_admin:'identity.error.protected', already_member:'identity.error.alreadyMember',
  account_unconfirmed:'identity.error.accountUnconfirmed', user_not_available:'ownerUsers.error.userNotAvailable',
  invalid_role:'identity.error.invalidRole', role_not_available:'ownerUsers.error.roleNotAvailable',
  invalid_email:'invalidEmail', invalid_name:'identity.error.invalidName',
  invalid_venue_id:'identity.error.invalidVenue', invalid_user_id:'identity.error.invalidUser',
  invalid_action:'identity.error.invalidAction', invalid_portal_access:'identity.error.invalidAction',
  invite_send_failed:'identity.error.inviteSendFailed',
  last_owner:'ownerUsers.error.lastOwner', confirmation_required:'ownerUsers.error.confirmationRequired',
  busy_retry:'ownerUsers.error.busyRetry', not_owner:'ownerUsers.error.notOwner',
  invalid_operation:'identity.error.invalidAction',
};

const str = (v: unknown) => typeof v === 'string' ? v : null;
const bad = (): never => { throw new PortalError('genericError'); };
function user(v: unknown): OwnerUser {
  const u = v as Record<string,unknown> | null;
  if (!u || typeof u.user_id !== 'string' || typeof u.email !== 'string' || typeof u.role !== 'string' || !['active','invited','inactive'].includes(String(u.status))) return bad();
  const is_self = u.is_self === true;
  // Anything the backend marks in an unknown way stays read-only.
  const locked = u.locked === null || u.locked === undefined ? (is_self ? 'self' : null)
    : u.locked === 'self' || u.locked === 'owner' ? u.locked : 'super_admin';
  return {user_id:u.user_id,email:u.email,full_name:str(u.full_name),role:u.role,status:u.status as OwnerUserStatus,
    portal_access:u.portal_access===true,member_since:str(u.member_since),is_self,locked,
    owner_actions: !is_self && locked !== 'self' && locked !== 'super_admin' && Array.isArray(u.owner_actions)
      ? u.owner_actions.filter((op): op is OwnerOperation => op === 'appoint' || op === 'demote' || op === 'remove') : []};
}
// Explicit allow-list: nothing beyond these fields reaches state or the query cache.
export function projectOwnerUsers(data: Record<string,unknown>): OwnerUsers {
  const venue = data.venue as Record<string,unknown> | null;
  if (!venue || typeof venue.id !== 'string' || typeof venue.name !== 'string' || !Array.isArray(data.users) || !Array.isArray(data.roles)) return bad();
  const roles=data.roles.filter((role: unknown): role is string=>typeof role==='string'&&role!=='owner'&&role!=='super_admin');
  return {venue:{id:venue.id,name:venue.name},users:data.users.map(user),roles,
    invite_roles:Array.isArray(data.invite_roles) ? data.invite_roles.filter((role): role is string=>typeof role==='string'&&(role==='owner'||roles.includes(role))) : roles,
    owner_count:typeof data.owner_count==='number'&&Number.isInteger(data.owner_count)&&data.owner_count>=0?data.owner_count:null};
}
export function ownerUsersRequest(venueId: string, body: Record<string,unknown>): Promise<Record<string,unknown>> {
  return invokeFunction('owner-venue-users',{...body,venue_id:venueId},ownerUserCodes);
}
export async function getOwnerUsers(venueId: string): Promise<OwnerUsers> {
  return projectOwnerUsers(await ownerUsersRequest(venueId,{action:'list'}));
}
