export type IdentityStatus = 'active' | 'invited' | 'revoked';
export type IdentityVenue = { id: string; name: string };
export type IdentityUser = {
  user_id: string; email: string; full_name: string | null;
  // Venue role: one per person, applied to every venue they are assigned to.
  role: string | null; status: IdentityStatus; venues: IdentityVenue[]; all_venues: boolean; protected: boolean;
  // Platform staff role, a separate namespace from the venue role.
  platform_role: string | null; last_sign_in_at: string | null; created_at: string | null; is_self: boolean;
};
export type IdentityDirectory = { users: IdentityUser[]; venues: (IdentityVenue & { is_active: boolean | null })[]; roles: string[] };
export type IdentityAudit = { id: string; action: string; created_at: string; actor_email: string | null };
export type IdentityDetail = { user: IdentityUser; audit: IdentityAudit[] };
export type IdentityAction = 'set_role' | 'set_assignments' | 'revoke' | 'send_recovery';

// Labels fall back to the raw slug so an unknown role or audit action stays visible.
export function slugLabel(t: (key: string) => string, prefix: string, slug: string) {
  const key=`${prefix}.${slug}`; const label=t(key);
  return label===key ? slug : label;
}
export function venueRoleLabel(t: (key: string) => string, role: string | null) { return role ? slugLabel(t,'identity.role',role) : t('identity.noRole'); }
export function venuesLabel(t: (key: string) => string, person: Pick<IdentityUser,'venues'|'all_venues'>) {
  return person.all_venues ? t('identity.allVenues') : person.venues.length ? person.venues.map(v=>v.name).join(', ') : t('identity.noVenues');
}
export function matchesIdentity(person: IdentityUser, filter: { query: string; venue: string; role: string; status: string }) {
  const query=filter.query.trim().toLocaleLowerCase();
  if (query && ![person.full_name,person.email].some(value=>value?.toLocaleLowerCase().includes(query))) return false;
  if (filter.venue && !person.all_venues && !person.venues.some(v=>v.id===filter.venue)) return false;
  if (filter.role && person.role!==filter.role) return false;
  return !filter.status || person.status===filter.status;
}
