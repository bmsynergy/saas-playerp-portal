import { supabase } from './supabase';
import { PortalError } from './errors';

// PE-462: one DTO describes a Print Server's preparation and its administrative venue link.
// Preparing (one-time pse_ code, entered on the Raspberry) is separate from assigning (venue only).
export type PsLinkState = 'pendiente_preparacion' | 'en_stock' | 'asignado_pendiente_sync' | 'sincronizado' | 'retirado';
export type PsOnboardingMissing = 'prepare_code' | 'device_enroll' | 'venue_assignment' | 'device_sync';
export type PsOnboardingStep = 'prepare' | 'enter_code_on_device' | 'assign' | 'wait_sync';
export type PsPreparationState = 'not_started' | 'code_issued' | 'code_expired' | 'prepared';
export type PsDeviceLink = {
  device_id: string; serial: string; label: string | null; display_name: string; model: string; model_label: string | null;
  venue_id: string | null; venue_name: string | null;
  state: PsLinkState; lifecycle: 'stock' | 'assigned' | 'retired'; legacy: boolean;
  prepared: boolean; print_server_id: string | null;
  rev: number | null; ack_rev: number | null; ack_at: string | null; changed_at: string | null;
  sync?: {scope:'venue'|'unlinked';rev:number|null;ack_rev:number|null;ack_at:string|null;confirmed:boolean;requires_capability:'link_ack'|'unlink_ack'} | null;
  preparation: { state: PsPreparationState; code_expires_at: string | null; prepared_at: string | null };
  reported: { firmware_version: string | null; hostname: string | null; last_seen_at: string | null };
  onboarding: { missing: PsOnboardingMissing[]; next_step: PsOnboardingStep | null };
};
export const PS_LINK_STATES: readonly PsLinkState[] = ['pendiente_preparacion', 'en_stock', 'asignado_pendiente_sync', 'sincronizado', 'retirado'];
const MISSING: readonly PsOnboardingMissing[] = ['prepare_code', 'device_enroll', 'venue_assignment', 'device_sync'];
const STEPS: readonly PsOnboardingStep[] = ['prepare', 'enter_code_on_device', 'assign', 'wait_sync'];
const PREPARATION: readonly PsPreparationState[] = ['not_started', 'code_issued', 'code_expired', 'prepared'];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null;
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const one = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed as readonly unknown[]).includes(v) ? v as T : null;
const bad = (): never => { throw new PortalError('genericError'); };

// Closed, defensive projection: an absent or malformed link (older backend) yields null so
// callers keep their previous rendering. Nothing outside the published DTO enters UI state.
export function projectPsLink(value: unknown): PsDeviceLink | null {
  const l = obj(value);
  const state = one(l?.state, PS_LINK_STATES);
  if (!l || !state || !str(l.device_id)) return null;
  const p = obj(l.preparation) ?? {}, r = obj(l.reported) ?? {}, o = obj(l.onboarding) ?? {};
  const lifecycle = one(l.lifecycle, ['stock', 'assigned', 'retired'] as const) ?? (state === 'retirado' ? 'retired' : l.venue_id ? 'assigned' : 'stock');
  const serial = str(l.serial) ?? '', label = str(l.label);
  const sync=obj(l.sync);
  const confirmed=!!sync && sync.confirmed===true && num(sync.rev)!==null && (sync.scope==='unlinked'||num(sync.rev)===num(l.rev)) && num(sync.ack_rev)===num(sync.rev) && !!str(sync.ack_at) && ((sync.scope==='venue'&&!!str(l.venue_id))||(sync.scope==='unlinked'&&!str(l.venue_id)));
  const effectiveState=state==='sincronizado'&&sync&&!confirmed?'asignado_pendiente_sync':state;
  return {
    device_id: l.device_id as string, serial, label, display_name: str(l.display_name) ?? label ?? serial, model: str(l.model) ?? '', model_label: str(l.model_label),
    venue_id: str(l.venue_id), venue_name: str(l.venue_name),
    state:effectiveState, lifecycle, legacy: l.legacy === true, prepared: l.prepared === true, print_server_id: str(l.print_server_id),
    rev: num(l.rev), ack_rev: num(l.ack_rev), ack_at: str(l.ack_at), changed_at: str(l.changed_at),
    sync: sync ? {scope:sync.scope==='unlinked'?'unlinked':'venue',rev:num(sync.rev),ack_rev:num(sync.ack_rev),ack_at:str(sync.ack_at),confirmed,requires_capability:sync.requires_capability==='unlink_ack'?'unlink_ack':'link_ack'} : null,
    preparation: { state: one(p.state, PREPARATION) ?? (l.prepared === true ? 'prepared' : 'not_started'), code_expires_at: str(p.code_expires_at), prepared_at: str(p.prepared_at) },
    reported: { firmware_version: str(r.firmware_version), hostname: str(r.hostname), last_seen_at: str(r.last_seen_at) },
    onboarding: { missing: Array.isArray(o.missing) ? o.missing.filter((m): m is PsOnboardingMissing => (MISSING as readonly unknown[]).includes(m)) : [], next_step: one(o.next_step, STEPS) },
  };
}

// Pure presentation helpers (unit tested).
export const psLinkStateKey = (state: PsLinkState) => `psLink.state.${state}`;
export function psLinkStateClass(state: PsLinkState): string {
  return state === 'sincronizado' ? 'server-online' : state === 'retirado' ? 'server-revoked' : state === 'en_stock' ? 'server-pending' : 'server-offline';
}
// The device's own report is never invented: a missing value renders as "Pending".
export const reportedOr = (value: string | null | undefined, pending: string): string => value?.trim() ? value : pending;

export type LabelCheck = { ok: true; value: string | null } | { ok: false; reason: 'too_long' | 'invalid_chars' };
// Mirrors ps_device_set_label: trimmed, 1..80 chars, no control chars nor < >. Empty clears (null).
export function validatePsLabel(input: string): LabelCheck {
  const value = input.trim();
  if (!value) return { ok: true, value: null };
  if ([...value].length > 80) return { ok: false, reason: 'too_long' };
  if (/[\p{Cc}<>]/u.test(value)) return { ok: false, reason: 'invalid_chars' };
  return { ok: true, value };
}

// ok:false answers of the link RPCs carry a clear Spanish message and a next step.
export type PsLinkNextStep = string;
export class PsLinkError extends Error {
  constructor(public code: string, public serverMessage: string | null, public nextStep: PsLinkNextStep | null) { super(code); }
}
function checked(value: unknown): Raw {
  const data = obj(value) ?? bad();
  if (data.ok === false) {
    const code = typeof data.error === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(data.error) ? data.error : 'other';
    const message = typeof data.message === 'string' && data.message.trim() && data.message.length <= 500 ? data.message.trim() : null;
    throw new PsLinkError(code, message, str(data.next_step));
  }
  return data.ok === true ? data : bad();
}
async function rpc(name: string, params: Raw, signal?: AbortSignal): Promise<Raw> {
  const request = supabase.rpc(name, params);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) {
    if ((error as { code?: string }).code === '42501') throw new PsLinkError('forbidden', null, null);
    throw error;
  }
  return checked(data);
}

export type PsAssignResult = { already_assigned: boolean; device_id: string; venue_id: string; print_server_id: string | null; link: PsDeviceLink | null; moved_from_venue_id: string | null };
// Assign/move never return a code: anything code-like in the answer is dropped.
export function projectAssignResult(value: unknown): PsAssignResult {
  const data = checked(value);
  return { already_assigned: data.already_assigned === true, device_id: str(data.device_id) ?? bad(), venue_id: str(data.venue_id) ?? bad(),
    print_server_id: str(data.print_server_id), link: projectPsLink(data.link), moved_from_venue_id: str(data.moved_from_venue_id) };
}
export async function linkAssign(name: 'ps_admin_device_assign' | 'ps_admin_device_move', deviceId: string, venueId: string): Promise<PsAssignResult> {
  return projectAssignResult(await rpc(name, { p_device_id: deviceId, p_venue_id: venueId }));
}

export type PsPrepareResult = { device_id: string; enrollment_code: string | null; expires_at: string | null; already_prepared: boolean; code_already_issued: boolean; link: PsDeviceLink | null };
export function projectPrepareResult(value: unknown): PsPrepareResult {
  const data = checked(value);
  return { device_id: str(data.device_id) ?? bad(), enrollment_code: str(data.enrollment_code), expires_at: str(data.expires_at),
    already_prepared: data.already_prepared === true, code_already_issued: data.code_already_issued === true, link: projectPsLink(data.link) };
}
export async function prepareDevice(deviceId: string, regenerate = false): Promise<PsPrepareResult> {
  const result=projectPrepareResult(await rpc('ps_admin_device_prepare', { p_device_id: deviceId, p_regenerate: regenerate }));
  if(result.device_id!==deviceId||(result.link&&result.link.device_id!==deviceId))throw new PortalError('accessDenied');
  return result;
}
export async function setDeviceLabel(deviceId: string, label: string | null): Promise<{ changed: boolean; label: string | null; link: PsDeviceLink | null }> {
  const data = await rpc('ps_device_set_label', { p_device_id: deviceId, p_label: label });
  if(data.device_id!=null&&data.device_id!==deviceId)throw new PortalError('accessDenied');
  if(data.link&&projectPsLink(data.link)?.device_id!==deviceId)throw new PortalError('accessDenied');
  return { changed: data.changed !== false, label: str(data.label), link: projectPsLink(data.link) };
}
export async function getDeviceLinkStatus(deviceId: string, signal?: AbortSignal): Promise<PsDeviceLink | null> {
  return projectPsLink((await rpc('ps_device_link_status', { p_device_id: deviceId }, signal)).link);
}
// Name of the Raspberry's Wi-Fi setup assistant (canonical PlayERP-Setup-<serial without "PS-">).
export const setupSsid = (serial: string) => `PlayERP-Setup-${serial.trim().replace(/^PS-/i, '')}`;
// Message for a rejected link RPC: the server's clear text first, then a known code, then generic.
export function psLinkErrorText(error: unknown, t: (key: string) => string, fallback: string): string {
  if (!(error instanceof PsLinkError)) return fallback;
  const key = `psLink.error.${error.code}`;
  const text = error.serverMessage ?? (t(key) !== key ? t(key) : t('psLink.error.other'));
  const nextKey=error.nextStep?`psLink.next.${error.nextStep}`:'';
  return nextKey&&t(nextKey)!==nextKey ? `${text} ${t(nextKey)}` : text;
}
