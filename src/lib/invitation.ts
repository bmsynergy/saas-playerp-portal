import { supabase } from './supabase';
import { getAccess } from './api';
import { acceptInvitation, StaffError } from './staff';

export async function savePassword(password: string, invitation: boolean) {
  const { error } = await supabase.auth.updateUser({ password });
  // A previous attempt may have saved the password before completion failed.
  // Let that invited user finish with the same password after a reload/retry.
  if (error && !(invitation && error.code === 'same_password')) throw error;
  if (!invitation) return;
  try {
    // A person can have both a venue membership and a pending SaaS invitation.
    // This RPC accepts only a real platform invitation; it grants no venue role.
    await acceptInvitation();
  } catch (error) {
    const noPlatformInvitation = error instanceof StaffError && error.key === 'staff.noInvitation';
    const revokedPlatform = (error as {code?: string; message?: string})?.code === '42501'
      && (error as {message?: string}).message === 'membership_revoked';
    if (!noPlatformInvitation && !revokedPlatform) throw error;
    // Venue membership is already granted by its inviter. Auth confirms email.
    // Independently revoked SaaS access must never be reactivated by this flow.
    // Only fresh server access can complete the venue invitation, never metadata.
    const access = await getAccess();
    if (access.owner_venues.length === 0) throw error;
  }
}
