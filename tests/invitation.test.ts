import { beforeEach, expect, it, vi } from 'vitest';
const { updateUser, getAccess, acceptInvitation } = vi.hoisted(() => ({ updateUser: vi.fn(), getAccess: vi.fn(), acceptInvitation: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { updateUser } } }));
vi.mock('../src/lib/api', () => ({ getAccess }));
vi.mock('../src/lib/staff', async (original) => ({ ...await original<typeof import('../src/lib/staff')>(), acceptInvitation }));
import { StaffError } from '../src/lib/staff';
import { savePassword } from '../src/lib/invitation';
beforeEach(() => { vi.resetAllMocks(); updateUser.mockResolvedValue({error:null}); getAccess.mockResolvedValue({owner_venues:[]}); });
it('completes an invited owner when the server says there is no platform invitation', async () => {
  acceptInvitation.mockRejectedValue(new StaffError('staff.noInvitation'));
  getAccess.mockResolvedValue({owner_venues:[{id:'venue',is_owner:true}]});
  await savePassword('new password', true);
  expect(updateUser).toHaveBeenCalledWith({password:'new password'});
  expect(acceptInvitation).toHaveBeenCalledOnce();
});
it('preserves SaaS staff invitation acceptance when no venue access exists', async () => {
  await savePassword('new password', true);
  expect(acceptInvitation).toHaveBeenCalledOnce();
});
it('does not suppress a rejected platform invitation', async () => {
  acceptInvitation.mockRejectedValue(new Error('no invitation'));
  await expect(savePassword('new password', true)).rejects.toThrow('no invitation');
});
it('can retry completion after the password was saved on the first attempt', async () => {
  updateUser.mockResolvedValue({error:{code:'same_password'}});
  acceptInvitation.mockRejectedValue(new StaffError('staff.noInvitation'));
  getAccess.mockResolvedValue({owner_venues:[{id:'venue'}]});
  await expect(savePassword('same password', true)).resolves.toBeUndefined();
});
it('does not accept an invitation on password or access lookup failures', async () => {
  const error={code:'weak_password'}; updateUser.mockResolvedValue({error});
  await expect(savePassword('password', true)).rejects.toEqual(error);
  expect(getAccess).not.toHaveBeenCalled();
  updateUser.mockResolvedValue({error:null}); acceptInvitation.mockRejectedValue(new StaffError('staff.noInvitation')); getAccess.mockRejectedValue(new Error('offline'));
  await expect(savePassword('password', true)).rejects.toThrow('offline');
});
it('keeps ordinary password resets independent from invitation acceptance', async () => {
  await savePassword('new password', false);
  expect(getAccess).not.toHaveBeenCalled(); expect(acceptInvitation).not.toHaveBeenCalled();
  updateUser.mockResolvedValue({error:{code:'same_password'}});
  await expect(savePassword('same password', false)).rejects.toEqual({code:'same_password'});
});

it('accepts a pending SaaS invitation even when the account also owns a venue', async () => {
  getAccess.mockResolvedValue({owner_venues:[{id:'venue'}]});
  await savePassword('password', true);
  expect(acceptInvitation).toHaveBeenCalledOnce();
});
it('never ignores platform network or unexpected permission failures', async () => {
  for (const error of [new Error('offline'), {code:'42501',message:'unexpected refusal'}]) {
    acceptInvitation.mockRejectedValue(error);
    await expect(savePassword('password', true)).rejects.toEqual(error);
  }
  expect(getAccess).not.toHaveBeenCalled();
});
it('allows independent venue access without restoring revoked platform access', async () => {
  const error={code:'42501',message:'membership_revoked'};
  acceptInvitation.mockRejectedValue(error);
  getAccess.mockResolvedValueOnce({owner_venues:[{id:'venue'}]});
  await expect(savePassword('password', true)).resolves.toBeUndefined();
  await expect(savePassword('password', true)).rejects.toEqual(error);
});
