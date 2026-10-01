export interface OwnerVenue {
  id: string; name: string; slug: string | null; city: string | null;
  state: string | null; address: string | null; phone: string | null;
  email: string | null; timezone: string | null; is_active: boolean | null;
}
export interface PrintServerSummary {
  id: string; venue_id: string; software_version: string | null;
  last_seen_at: string | null; status: 'pending' | 'active' | 'revoked';
}
export interface TenantDetail { venue: OwnerVenue; print_servers: PrintServerSummary[] }
export interface PortalAccess { is_platform_staff: boolean; can_manage_staff: boolean; owner_venues: OwnerVenue[] }
export type UiError = 'invalidCredentials' | 'networkError' | 'accessDenied' | 'sessionExpired' | 'invalidLink' | 'weakPassword' | 'rateLimited' | 'passwordMismatch' | 'requiredFields' | 'invalidEmail' | 'genericError';
export type SignalState = 'pending' | 'revoked' | 'online' | 'offline' | 'noSignal';
