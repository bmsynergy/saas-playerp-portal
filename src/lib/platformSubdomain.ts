import { supabase } from './supabase';
import { errorCode, PortalError } from './errors';

// PE-577.1: labels go to the server; domain bases and actual saved addresses come back.
export interface SubdomainCheck {
  subdomain: string; domain: string | null; available: boolean; reason: string | null; environment_state: string;
}
export interface VenueAddress {
  venue_id: string; venue_name: string; slug: string;
  platform_subdomain: {
    label: string | null; domain: string | null; source: string; candidates: string[];
    address_state: string; serving_state: string; environment_state: string; operational: boolean; public_url: string | null;
  };
  aliases: {label: string; domain: string; status: string}[];
  external_primary: {domain: string; status: string} | null;
  primary_is_platform_address: boolean;
  external_domains: {domain: string; status: string; is_primary: boolean}[];
  unclassified_platform_like: {domain: string; status: string}[];
  venue_state: {is_active: boolean; lifecycle: string};
  environment: {environment: string; base: string; base_status: string; current_app_url: string; current_portal_url: string; future_portal_url: string | null};
}
export interface ChangePreview {
  from: string | null; from_source: string; from_status: string | null; to: string; to_status_after: string;
  to_is_own_previous_address: boolean; old_address_effect: string; new_address_operational_after: boolean;
  unchanged: string[]; environment_state: string;
}
export interface ChangeResult { changed: boolean; confirm_required?: boolean; preview?: ChangePreview; address?: VenueAddress; reason?: string }
async function rpc(name: string, params: Record<string, unknown>) {
  const {data, error} = await supabase.rpc(name, params);
  if (error) throw error;
  if (!data || typeof data !== 'object' || data.error) throw new PortalError('genericError');
  return data;
}
function readCheck(data: SubdomainCheck): SubdomainCheck {
  if (typeof data.subdomain !== 'string' || typeof data.available !== 'boolean' || typeof data.environment_state !== 'string') throw new PortalError('genericError');
  return data;
}
export async function checkSubdomain(label: string, venueId?: string, requestKey?: string): Promise<SubdomainCheck> {
  return readCheck(await rpc('platform_subdomain_check', {p_subdomain: label, p_venue_id: venueId ?? null, p_request_key: requestKey ?? null}));
}
export async function suggestSubdomain(name: string, venueId?: string): Promise<SubdomainCheck> {
  return readCheck(await rpc('platform_subdomain_suggest', {p_name: name, p_venue_id: venueId ?? null}));
}
export async function getVenueAddress(venueId: string): Promise<VenueAddress> {
  const data = await rpc('platform_venue_address', {p_venue_id: venueId});
  if (data.venue_id !== venueId || !data.platform_subdomain || !data.environment || !data.venue_state || !Array.isArray(data.aliases)) throw new PortalError('genericError');
  return data;
}
export async function previewSubdomainChange(venueId: string, label: string, expectedCurrent: string | null): Promise<ChangeResult> {
  const data = await rpc('platform_venue_subdomain_change', {p_venue_id: venueId, p_new_subdomain: label, p_expected_current: expectedCurrent, p_confirm: false});
  if (data.reason !== 'already_current' && (data.confirm_required !== true || typeof data.preview?.to !== 'string')) throw new PortalError('genericError');
  return data;
}
export async function confirmSubdomainChange(venueId: string, label: string, expectedCurrent: string | null): Promise<ChangeResult> {
  const data = await rpc('platform_venue_subdomain_change', {p_venue_id: venueId, p_new_subdomain: label, p_expected_current: expectedCurrent, p_confirm: true});
  if (data.changed !== true && data.reason !== 'already_current') throw new PortalError('genericError');
  return data;
}
const errors: Record<string, string> = {
  invalid_platform_subdomain: 'invalid', reserved_platform_subdomain: 'reserved', platform_subdomain_unavailable: 'unavailable',
  stale_current: 'stale', platform_subdomain_ambiguous: 'ambiguous', platform_base_not_configured: 'environment', venue_not_found: 'notFound',
};
export function subdomainErrorKey(error: unknown): string {
  const message = (error as {message?: string})?.message ?? '';
  return errors[message] ? `subdomain.error.${errors[message]}` : errorCode(error);
}
