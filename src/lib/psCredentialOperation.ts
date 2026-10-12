import type { DeviceOp } from './psDevice';

export type CredentialKind = 'wifi' | 'admin_code';
export type CredentialOperation = {
  kind: CredentialKind;
  commandId: string | null;
  phase: 'sending' | 'pending' | 'applied' | 'failed';
  errorKey?: string;
};

// Acceptance of the RPC only queues an operation. Only this exact device
// confirmation may change its result; unrelated/history entries cannot do so.
export function reconcileCredentialOperation(operation: CredentialOperation, rotations: DeviceOp[]): CredentialOperation {
  if (!operation.commandId || operation.phase !== 'pending') return operation;
  const match = rotations.find(item => item.command_id === operation.commandId && item.kind === operation.kind);
  if (!match || match.status === 'pending') return operation;
  return { ...operation, phase: match.status, errorKey: match.status === 'failed' ? `dev.error.${match.error_code ?? 'other'}` : undefined };
}
