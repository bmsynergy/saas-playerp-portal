import { supabase } from './supabase';
import { confirmedAt, validRecoveryWifi } from './psDevice';
import { psErrorFromCode } from './printServerApi';
import type { LabelData } from './psLabel';

export type RecoveryLabelMissing = 'credentials_permission' | 'device_not_assigned' | 'print_server_not_active' | 'wifi_not_confirmed' | 'invalid_label';
export type RecoveryLabelState = { ready: boolean; missing: RecoveryLabelMissing[]; wifiRotationPending: boolean; label: LabelData | null };
const reasons: RecoveryLabelMissing[] = ['credentials_permission', 'device_not_assigned', 'print_server_not_active', 'wifi_not_confirmed'];
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;

// Explicit projection: administrative codes, tokens and unconfirmed values never enter label state.
export function projectRecoveryLabel(value: unknown): RecoveryLabelState {
  const raw = object(value);
  if (!raw || raw.ok !== true) throw psErrorFromCode(raw?.error);
  const blocked = (missing: RecoveryLabelMissing[]): RecoveryLabelState => ({ ready: false, missing, wifiRotationPending: raw.wifi_rotation_pending === true, label: null });
  if (raw.label_version !== 1 || !Array.isArray(raw.missing) || typeof raw.ready !== 'boolean' || typeof raw.wifi_rotation_pending !== 'boolean') return blocked(['invalid_label']);
  const missing = [...new Set(raw.missing.map(reason => reasons.includes(reason) ? reason as RecoveryLabelMissing : 'invalid_label' as const))];
  if (!raw.ready || missing.length) return blocked(missing.length ? missing : ['invalid_label']);
  const label = object(raw.label);
  if (!label || typeof label.device_id !== 'string' || !label.device_id.trim()
    || typeof label.serial !== 'string' || !/^PS-[A-Z0-9]{8}$/.test(label.serial)
    || !validRecoveryWifi(label.ssid, label.psk) || !confirmedAt(label.wifi_applied_at)) return blocked(['invalid_label']);
  return {
    ready: true, missing: [], wifiRotationPending: raw.wifi_rotation_pending,
    label: { deviceId: label.device_id, serial: label.serial, ssid: label.ssid as string, password: label.psk as string, appliedAt: label.wifi_applied_at as string },
  };
}

export async function getRecoveryLabel(venueId: string, signal?: AbortSignal): Promise<RecoveryLabelState> {
  const request = supabase.rpc('ps_panel_recovery_label', { p_venue_id: venueId });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  return projectRecoveryLabel(data);
}
