import { latestRotation, type DeviceOp } from './psDevice';

export type CredentialKind = 'wifi' | 'admin_code';
export type CredentialOperation = {
  kind: CredentialKind;
  commandId: string | null;
  phase: 'sending' | 'pending' | 'applied' | 'failed' | 'rejected' | 'uncertain';
  errorKey?: string;
  requestedAt?: string | null;
  already?: boolean;
  // IDs known before a lost RPC response, never credentials or payloads.
  previousIds?: string[];
};
export type CredentialProgressView = {
  kind: CredentialKind;
  phase: 'sending' | 'accepted' | 'pending' | 'offline' | 'received' | 'applied' | 'failed' | 'rejected' | 'uncertain';
  commandId: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
  waitReason: string | null;
  errorKey?: string;
  already?: boolean;
  previousKept?: boolean;
};
const errorCodes = new Set(['wifi_not_confirmed', 'admin_code_not_confirmed', 'no_device_credentials', 'device_not_assigned', 'device_offline', 'apply_failed', 'wifi_apply_failed', 'admin_code_apply_failed', 'timeout', 'expired', 'cancelled', 'invalid_value', 'unsupported', 'internal_error']);
export function credentialErrorKey(code: string | null | undefined): string {
  return code && errorCodes.has(code) ? `dev.error.${code}` : 'dev.progress.rotationErrorUnknown';
}
export const credentialBlocked = (op: CredentialOperation | null) => !!op && ['sending', 'pending', 'uncertain'].includes(op.phase);

// Acceptance of the RPC only queues an operation. Resolve exactly the acknowledged ID;
// after a lost response, a new/open same-kind order from the sheet can reconcile it.
export function reconcileCredentialOperation(operation: CredentialOperation, rotations: DeviceOp[]): CredentialOperation {
  if (['sending', 'rejected', 'applied', 'failed'].includes(operation.phase)) return operation;
  const match = operation.commandId
    ? rotations.find(item => item.command_id === operation.commandId && item.kind === operation.kind)
    : operation.phase === 'uncertain'
      ? rotations.find(item => item.kind === operation.kind && (item.status === 'pending' || !operation.previousIds?.includes(item.command_id)))
      : null;
  if (!match) return operation;
  return { ...operation, commandId: match.command_id, requestedAt: match.requested_at, phase: match.status,
    errorKey: match.status === 'failed' ? credentialErrorKey(match.error_code) : undefined };
}
const validDate = (value: string | null | undefined): string | null => value && Number.isFinite(Date.parse(value)) ? value : null;
function updatedAt(item: DeviceOp): string | null {
  // These are backend event timestamps, never a browser fetch timestamp.
  return [item.completed_at, item.wait_updated_at, item.received_at, item.requested_at]
    .map(validDate).filter((v): v is string => !!v).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}
export function credentialProgress(kind: CredentialKind, rotations: DeviceOp[], local: CredentialOperation | null, online: boolean | null, trackingLost: boolean): CredentialProgressView | null {
  const operation = local ? reconcileCredentialOperation(local, rotations) : null;
  const item = operation?.commandId ? rotations.find(o => o.kind === kind && o.command_id === operation.commandId)
    : operation ? null : latestRotation(rotations, kind);
  if (!operation && !item) return null;
  const base = { kind, commandId: operation?.commandId ?? item?.command_id ?? null,
    requestedAt: validDate(item?.requested_at ?? operation?.requestedAt), updatedAt: item ? updatedAt(item) : null,
    waitReason: item?.wait_reason ?? null, already: operation?.already, previousKept: item?.previous_kept };
  if (operation?.phase === 'sending' || operation?.phase === 'rejected') return { ...base, phase: operation.phase, errorKey: operation.errorKey };
  if (trackingLost || operation?.phase === 'uncertain') return { ...base, phase: 'uncertain', errorKey: 'dev.progress.trackingLost' };
  if (item) {
    if (item.status === 'applied' || item.status === 'failed') return { ...base, phase: item.status, errorKey: item.status === 'failed' ? credentialErrorKey(item.error_code) : undefined };
    // Contract 8676b3b derives "applying" from received_at. It is NOT execution telemetry.
    const phase = validDate(item.received_at) ? 'received' : item.wait_reason === 'device_offline' || online === false ? 'offline' : 'pending';
    return { ...base, phase, waitReason: item.wait_reason ?? (online === false ? 'device_offline' : null) };
  }
  return { ...base, phase: operation?.phase === 'pending' ? 'accepted' : operation?.phase ?? 'uncertain', errorKey: operation?.errorKey };
}
