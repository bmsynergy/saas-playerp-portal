import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
import { getOwnerUsers, ownerUserCodes, ownerUsersRequest, projectOwnerUsers } from '../src/lib/ownerUsers';
import { staffErrorKey } from '../src/lib/staff';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';

const venue = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const rawUser = { user_id: user, email: 'ana@example.invalid', full_name: 'Ana Ruiz', role: 'front_desk', status: 'active', portal_access: true,
  member_since: '2026-09-01T10:00:00Z', is_self: false, locked: null, other_venue_count: 3, platform_role: 'support', last_sign_in_at: 'X' };
const rawList = { venue: { id: venue, name: 'Centro', is_active: true }, users: [rawUser], roles: ['manager', 'front_desk', 'owner', 'super_admin', 7], extra: 'x' };
const refuse = (status: number, error: string) => invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error }), { status }) } });

beforeEach(() => invoke.mockReset());

describe('owner users projection', () => {
  it('keeps only this venue fields and never offers owner or super admin', () => {
    const list = projectOwnerUsers(rawList);
    expect(list).toEqual({ venue: { id: venue, name: 'Centro' },
      users: [{ user_id: user, email: 'ana@example.invalid', full_name: 'Ana Ruiz', role: 'front_desk', status: 'active', portal_access: true,
        member_since: '2026-09-01T10:00:00Z', is_self: false, locked: null }],
      roles: ['manager', 'front_desk'] });
    expect(JSON.stringify(list)).not.toMatch(/other_venue_count|platform_role|last_sign_in_at|extra/);
  });
  it('treats self and unknown locks as read-only and portal access as off unless true', () => {
    const lock = (extra: Record<string, unknown>) => projectOwnerUsers({ ...rawList, users: [{ ...rawUser, ...extra }] }).users[0];
    expect(lock({ is_self: true }).locked).toBe('self');
    expect(lock({ locked: 'owner' }).locked).toBe('owner');
    expect(lock({ locked: 'something_new' }).locked).toBe('super_admin');
    expect(lock({ portal_access: 'yes' }).portal_access).toBe(false);
  });
  it('rejects a malformed list', () => {
    expect(() => projectOwnerUsers({ ...rawList, users: [{ ...rawUser, status: 'weird' }] })).toThrow();
    expect(() => projectOwnerUsers({ users: [], roles: [] })).toThrow();
  });
});

describe('owner users requests', () => {
  it('always names the venue and calls the owner edge', async () => {
    invoke.mockResolvedValueOnce({ data: rawList, error: null });
    await getOwnerUsers(venue);
    expect(invoke).toHaveBeenCalledWith('owner-venue-users', { body: { action: 'list', venue_id: venue } });
  });
  it('maps every backend slug to a localized message in both languages', async () => {
    for (const key of Object.values(ownerUserCodes)) { expect(en).toHaveProperty([key]); expect(es).toHaveProperty([key]); }
    refuse(409, 'protected_owner');
    await expect(ownerUsersRequest(venue, { action: 'set_role' })).rejects.toSatisfy(e => staffErrorKey(e) === 'ownerUsers.error.protectedOwner');
    refuse(403, 'forbidden');
    await expect(ownerUsersRequest(venue, { action: 'list' })).rejects.toSatisfy(e => staffErrorKey(e) === 'accessDenied');
  });
});
