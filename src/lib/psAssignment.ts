import type { PsAssignResult } from './psLink';
import type { ResolvedDevice } from './psResolvedDevice';

/** A successful write is authoritative even if an unrelated refresh fails. */
export async function saveAssignment<T>(mutate: () => Promise<T>, saved: (value: T) => void, refresh: () => Promise<unknown>): Promise<{ readFailed: boolean }> {
  const value = await mutate(); // Mutation errors remain errors for the caller.
  saved(value);
  try { await refresh(); return { readFailed: false }; }
  catch { return { readFailed: true }; }
}

export function assignedDeviceSnapshot(device: ResolvedDevice, result: PsAssignResult, venueName: string): ResolvedDevice {
  if (result.device_id !== device.device_id || (result.link && (result.link.device_id !== device.device_id || result.link.venue_id !== result.venue_id))) throw new Error('assignment_identity_mismatch');
  const link = result.link ?? { ...device.link, venue_id: result.venue_id, venue_name: venueName, lifecycle: 'assigned' as const,
    state: 'asignado_pendiente_sync' as const, rev: null, ack_rev: null, ack_at: null, sync: null };
  return { ...device, venue: { id: result.venue_id, name: link.venue_name ?? venueName }, lifecycle: 'assigned', link,
    capabilities: { ...device.capabilities, assign: { allowed: false, reason: 'device_already_assigned' },
      unlink: { ...device.capabilities.unlink, allowed: false, expected_rev: null } } };
}
