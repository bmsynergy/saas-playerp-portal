import { describe, expect, it } from 'vitest';
import { reconcileCredentialOperation, type CredentialOperation } from '../src/lib/psCredentialOperation';
import type { DeviceOp } from '../src/lib/psDevice';

const pending: CredentialOperation = { kind: 'wifi', commandId: 'current', phase: 'pending' };
const op = (change: Partial<DeviceOp> = {}): DeviceOp => ({ command_id: 'current', kind: 'wifi', status: 'applied', requested_at: null, completed_at: null, error_code: null, ...change });
describe('credential device acknowledgment correlation', () => {
  it('request acceptance, missing history and unrelated operations never imply applied', () => {
    for (const rotations of [[], [op({command_id:'older'})], [op({kind:'admin_code'})], [op({status:'pending'})]]) {
      expect(reconcileCredentialOperation(pending, rotations)).toBe(pending);
    }
    const unknown: CredentialOperation = {...pending, commandId:null};
    expect(reconcileCredentialOperation(unknown, [op()])).toBe(unknown);
  });
  it('uses only the matching command and kind for either applied or failed', () => {
    expect(reconcileCredentialOperation(pending, [op()]).phase).toBe('applied');
    expect(reconcileCredentialOperation(pending, [op({status:'failed',error_code:'device_offline'})])).toEqual({...pending,phase:'failed',errorKey:'dev.error.device_offline'});
    const admin: CredentialOperation = {...pending,kind:'admin_code'};
    expect(reconcileCredentialOperation(admin, [op({kind:'admin_code'})]).phase).toBe('applied');
  });
  it('does not regress a confirmed terminal operation on a stale poll', () => {
    const applied: CredentialOperation = {...pending,phase:'applied'};
    expect(reconcileCredentialOperation(applied, [op({status:'pending'})])).toBe(applied);
  });
});
