import { PortalError } from './errors';
import { invokeFunction } from './staff';

// Venue users are administered per venue: every request names its venue, and a
// role or a revocation only ever applies to that venue.
export type VenueUserStatus = 'active' | 'invited' | 'inactive';
export type VenueUser = {
  user_id: string; email: string; full_name: string | null;
  // Role in this venue only; the same person can hold another role elsewhere.
  role: string; status: VenueUserStatus;
  // Legacy venue super admin: read-only here.
  protected: boolean; member_since: string | null; last_sign_in_at: string | null;
  other_venue_count: number; is_self: boolean;
};
export type VenueUsers = { venue: { id: string; name: string; is_active: boolean | null }; users: VenueUser[]; roles: string[] };
export type VenueUserAction = 'set_role' | 'revoke' | 'send_recovery';
export type VenueUserInvite = { email: string; first_name: string; last_name: string; role: string; locale: 'en' | 'es' };

// Every slug of the platform-identity-admin contract maps to a localized key.
export const venueUserCodes: Record<string,string> = {
  unauthorized:'sessionExpired', forbidden:'accessDenied', rate_limited:'rateLimited', server_error:'genericError',
  user_not_found:'identity.error.userNotFound', venue_not_found:'identity.error.venueNotFound', not_member:'identity.error.notMember',
  cannot_change_self:'identity.error.cannotChangeSelf', protected_super_admin:'identity.error.protected',
  already_member:'identity.error.alreadyMember', account_unconfirmed:'identity.error.accountUnconfirmed',
  invalid_role:'identity.error.invalidRole', invalid_email:'invalidEmail', invalid_name:'identity.error.invalidName',
  invalid_venue_id:'identity.error.invalidVenue', invalid_user_id:'identity.error.invalidUser',
  display_staff_dedicated:'identity.error.displayStaffDedicated', invalid_action:'identity.error.invalidAction',
  invite_send_failed:'identity.error.inviteSendFailed', recovery_send_failed:'identity.error.recoverySendFailed',
};

// Labels fall back to the raw slug so an unknown role or status stays visible.
export function slugLabel(t: (key: string) => string, prefix: string, slug: string) {
  const key=`${prefix}.${slug}`; const label=t(key);
  return label===key ? slug : label;
}
export function venueRoleLabel(t: (key: string) => string, role: string) { return slugLabel(t,'identity.role',role); }
export function otherVenuesLabel(t: (key: string) => string, count: number) {
  return count>0 ? t(count===1?'identity.otherVenuesOne':'identity.otherVenuesMany').replace('{count}',String(count)) : '';
}

const str = (v: unknown) => typeof v === 'string' ? v : null;
const bad = (): never => { throw new PortalError('genericError'); };
function user(v: unknown): VenueUser {
  const u = v as Record<string,unknown> | null;
  if (!u || typeof u.user_id !== 'string' || typeof u.email !== 'string' || typeof u.role !== 'string' || !['active','invited','inactive'].includes(String(u.status))) return bad();
  return {user_id:u.user_id,email:u.email,full_name:str(u.full_name),role:u.role,status:u.status as VenueUserStatus,protected:u.protected===true,
    member_since:str(u.member_since),last_sign_in_at:str(u.last_sign_in_at),
    other_venue_count:typeof u.other_venue_count==='number'&&u.other_venue_count>0?Math.floor(u.other_venue_count):0,is_self:u.is_self===true};
}
// Explicit allow-list: nothing beyond these fields reaches state or the query cache.
export function projectVenueUsers(data: Record<string,unknown>): VenueUsers {
  const venue = data.venue as Record<string,unknown> | null;
  if (!venue || typeof venue.id !== 'string' || typeof venue.name !== 'string' || !Array.isArray(data.users) || !Array.isArray(data.roles)) return bad();
  return {venue:{id:venue.id,name:venue.name,is_active:typeof venue.is_active==='boolean'?venue.is_active:null},
    users:data.users.map(user),
    // The platform never assigns the legacy venue super admin from here.
    roles:data.roles.filter((role: unknown): role is string=>typeof role==='string'&&role!=='super_admin')};
}
export function venueUsersRequest(venueId: string, body: Record<string,unknown>): Promise<Record<string,unknown>> {
  return invokeFunction('platform-identity-admin',{...body,venue_id:venueId},venueUserCodes);
}
export async function getVenueUsers(venueId: string): Promise<VenueUsers> {
  return projectVenueUsers(await venueUsersRequest(venueId,{action:'list'}));
}
