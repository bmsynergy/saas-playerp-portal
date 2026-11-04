import { supabase } from './supabase';
import { errorCode, PortalError } from './errors';
import { AUXILIARY_STORAGE_PREFIX } from './config';

// PE-575 · New tenant (edge platform-tenant-onboard), editable venue record
// (update_tenant_info) and readiness (portal_tenant_readiness). Backend contract:
// saas-playerp-backend 76052081, _docs/pe5751_alta_tenant_contrato.md.
export type OnboardingStatus = 'pending' | 'owner_ready' | 'provisioned' | 'completed' | 'invite_failed' | 'failed';
export interface OnboardingRequest {
  request_key: string; status: OnboardingStatus; venue_id: string | null; venue_name: string | null;
  venue_slug: string | null; owner_email: string | null; retryable: boolean; attempts: number;
  email_sent: boolean | null; email_kind: 'invite' | 'recovery' | null;
}
export interface TenantForm {
  name: string; slug: string; timezone: string; email: string; phone: string; address: string; city: string; state: string;
  owner_email: string; owner_first_name: string; owner_last_name: string; locale: 'es' | 'en';
}
export const emptyTenantForm = (locale: 'es' | 'en'): TenantForm => ({
  name: '', slug: '', timezone: 'America/Puerto_Rico', email: '', phone: '', address: '', city: '', state: '',
  owner_email: '', owner_first_name: '', owner_last_name: '', locale,
});
export class OnboardingError extends Error {
  constructor(public key: string, public request?: OnboardingRequest) { super(key); }
}
// Known server slugs become localized keys; anything else is a safe generic message.
const codes: Record<string, string> = {
  duplicate_slug: 'tenantNew.error.duplicateSlug', idempotency_conflict: 'tenantNew.error.conflict',
  account_unconfirmed: 'tenantNew.error.accountUnconfirmed', cannot_change_self: 'tenantNew.error.ownerNotAllowed',
  protected_super_admin: 'tenantNew.error.ownerNotAllowed', display_staff_dedicated: 'tenantNew.error.ownerNotAllowed',
  invalid_slug: 'tenantNew.error.invalidSlug', invalid_owner_email: 'tenantNew.error.invalidOwnerEmail',
  invalid_timezone: 'tenantNew.error.invalidTimezone', request_not_found: 'tenantNew.error.notFound',
  invalid_state: 'tenantNew.error.invalidState',
};

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function slugify(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/g, '');
}
export function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return !!tz; } catch { return false; }
}
// Step 0 = venue, step 1 = owner. Returns the field keys that block moving on.
export function invalidFields(form: TenantForm, step: 0 | 1): (keyof TenantForm)[] {
  const bad: (keyof TenantForm)[] = [];
  if (step === 0) {
    if (!form.name.trim() || form.name.trim().length > 120) bad.push('name');
    if (!SLUG.test(form.slug)) bad.push('slug');
    if (!validTimezone(form.timezone.trim())) bad.push('timezone');
    if (form.email.trim() && !EMAIL.test(form.email.trim())) bad.push('email');
  } else {
    if (!EMAIL.test(form.owner_email.trim())) bad.push('owner_email');
    if (!form.owner_first_name.trim()) bad.push('owner_first_name');
    if (!form.owner_last_name.trim()) bad.push('owner_last_name');
  }
  return bad;
}
const opt = (v: string) => v.trim() || undefined;
export function createBody(form: TenantForm, requestKey: string) {
  return {
    action: 'create', request_key: requestKey, locale: form.locale,
    venue: { name: form.name.trim(), slug: form.slug, timezone: form.timezone.trim(), email: opt(form.email), phone: opt(form.phone), address: opt(form.address), city: opt(form.city), state: opt(form.state) },
    owner: { email: form.owner_email.trim().toLowerCase(), first_name: form.owner_first_name.trim(), last_name: form.owner_last_name.trim() },
    billing: {},
  };
}
const STATUSES: OnboardingStatus[] = ['pending', 'owner_ready', 'provisioned', 'completed', 'invite_failed', 'failed'];
const str = (v: unknown) => typeof v === 'string' ? v : null;
export function toRequest(d: Record<string, unknown>): OnboardingRequest {
  if (typeof d.request_key !== 'string' || !STATUSES.includes(d.status as OnboardingStatus)) throw new PortalError('genericError');
  return {
    request_key: d.request_key, status: d.status as OnboardingStatus, venue_id: str(d.venue_id), venue_name: str(d.venue_name),
    venue_slug: str(d.venue_slug), owner_email: str(d.owner_email), retryable: d.retryable === true,
    attempts: typeof d.attempts === 'number' ? d.attempts : 0,
    email_sent: typeof d.email_sent === 'boolean' ? d.email_sent : null,
    email_kind: d.email_kind === 'invite' || d.email_kind === 'recovery' ? d.email_kind : null,
  };
}
async function onboard(body: Record<string, unknown>): Promise<OnboardingRequest> {
  const { data, error } = await supabase.functions.invoke('platform-tenant-onboard', { body });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    if (!response) throw error;
    let json: Record<string, unknown> | null = null;
    try { json = await response.clone().json(); } catch { /* safe generic message */ }
    const code = String(json?.error ?? '');
    // A compensated failure (no venue created) is retryable with the same key.
    const failed = json && json.status === 'failed' ? { request_key: String(body.request_key), status: 'failed' as const, venue_id: null, venue_name: null, venue_slug: null, owner_email: null, retryable: json.retryable === true, attempts: 0, email_sent: null, email_kind: null } : undefined;
    if (codes[code]) throw new OnboardingError(codes[code], failed);
    if (code.startsWith('invalid_')) throw new OnboardingError('tenantNew.error.invalidData', failed);
    throw new OnboardingError(errorCode({ status: response.status }), failed);
  }
  if (!data || data.error) throw new PortalError('genericError');
  return toRequest(data);
}
export const createTenant = (form: TenantForm, requestKey: string) => onboard(createBody(form, requestKey));
export const resendOwnerInvite = (requestKey: string) => onboard({ action: 'resend_invite', request_key: requestKey });
export const onboardingStatus = (requestKey: string) => onboard({ action: 'status', request_key: requestKey });
export function onboardingErrorKey(error: unknown): string {
  return error instanceof OnboardingError ? error.key : errorCode(error);
}

// The draft lives only in this tab and only for this user; it is removed on
// completion and on sign-out (clearScopes-style prefix sweep below).
const draftKey = (userId: string) => `${AUXILIARY_STORAGE_PREFIX}newTenant.${userId}`;
export interface TenantDraft { request_key: string; form: TenantForm; submitted: boolean }
export function loadDraft(userId: string): TenantDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(userId)); if (!raw) return null;
    const d = JSON.parse(raw) as TenantDraft;
    return typeof d?.request_key === 'string' && d.form && typeof d.form.name === 'string' ? d : null;
  } catch { return null; }
}
export function saveDraft(userId: string, draft: TenantDraft) { try { sessionStorage.setItem(draftKey(userId), JSON.stringify(draft)); } catch { /* wizard stays usable */ } }
export function clearDraft(userId?: string) {
  try { for (const k of Object.keys(sessionStorage)) if (userId ? k === draftKey(userId) : k.startsWith(`${AUXILIARY_STORAGE_PREFIX}newTenant.`)) sessionStorage.removeItem(k); } catch { /* storage unavailable */ }
}

// Readiness is calculated by the backend on each read; the portal never activates a venue.
export type Lifecycle = 'setup_incomplete' | 'ready' | 'active' | 'suspended';
export interface ReadinessItem { key: string; state: string; required_for_ready: boolean; managed_in: string; missing?: string[]; read_only?: boolean; [k: string]: unknown }
export interface Readiness { venue_id: string; lifecycle: Lifecycle; is_active: boolean; onboarding_status: string | null; billing: { status: string | null; plan_name: string | null }; items: ReadinessItem[] }
export async function getReadiness(venueId: string, signal?: AbortSignal): Promise<Readiness> {
  const req = supabase.rpc('portal_tenant_readiness', { p_venue_id: venueId });
  const { data, error } = await (signal ? req.abortSignal(signal) : req);
  if (error) throw error;
  if (data?.venue_id !== venueId || !Array.isArray(data.items) || !['setup_incomplete', 'ready', 'active', 'suspended'].includes(data.lifecycle)) throw new PortalError('genericError');
  return { venue_id: data.venue_id, lifecycle: data.lifecycle, is_active: data.is_active === true, onboarding_status: str(data.onboarding_status),
    billing: { status: str(data.billing?.status), plan_name: str(data.billing?.plan_name) },
    items: data.items.filter((i: ReadinessItem) => typeof i?.key === 'string' && typeof i.state === 'string') };
}

// Only the fields the existing read returns are editable, so nothing unknown is overwritten.
export type VenueFields = Record<'name' | 'email' | 'phone' | 'address' | 'city' | 'state' | 'timezone', string>;
export function changedFields(before: Partial<Record<keyof VenueFields, string | null>>, after: VenueFields): Partial<VenueFields> {
  const out: Partial<VenueFields> = {};
  for (const k of Object.keys(after) as (keyof VenueFields)[]) if ((before[k] ?? '').trim() !== after[k].trim()) out[k] = after[k].trim();
  return out;
}
export async function updateTenantInfo(venueId: string, fields: Partial<VenueFields>) {
  const { error } = await supabase.rpc('update_tenant_info', { p_venue_id: venueId, p_fields: fields });
  if (error) {
    if (error.code === '22023') throw new OnboardingError(error.message === 'invalid_email' ? 'tenantEdit.error.invalidEmail' : error.message === 'invalid_name' ? 'tenantEdit.error.invalidName' : error.message === 'invalid_timezone' ? 'tenantNew.error.invalidTimezone' : 'tenantNew.error.invalidData');
    throw error;
  }
}
