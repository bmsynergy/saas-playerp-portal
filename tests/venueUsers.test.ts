import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
import { getVenueUsers, otherVenuesLabel, projectVenueUsers, slugLabel, venueRoleLabel, venueUserCodes, venueUsersRequest } from '../src/lib/venueUsers';
import { staffErrorKey } from '../src/lib/staff';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';

const venue = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const rawUser = { user_id: user, email: 'ana@example.invalid', full_name: 'Ana Ruiz', role: 'front_desk', status: 'active', protected: false,
  member_since: '2026-09-01T10:00:00Z', last_sign_in_at: null, other_venue_count: 2, is_self: false, encrypted_password: 'HASH', recovery_token: 'TOKEN' };
const rawList = { venue: { id: venue, name: 'Centro', is_active: true, secret: 'S' }, users: [rawUser], roles: ['manager', 'front_desk', 'super_admin', 7], extra: 'x' };
const t = (locale: Record<string, string>) => (key: string) => locale[key] ?? key;
// The SDK reports a non-2xx answer as an error whose context is the Response.
const refuse = (status: number, error: string) => invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error }), { status }) } });

beforeEach(() => invoke.mockReset());

describe('venue users projection', () => {
  it('rebuilds the list field by field and never offers the legacy super admin', () => {
    const list = projectVenueUsers(rawList);
    expect(list).toEqual({ venue: { id: venue, name: 'Centro', is_active: true },
      users: [{ user_id: user, email: 'ana@example.invalid', full_name: 'Ana Ruiz', role: 'front_desk', status: 'active', protected: false,
        member_since: '2026-09-01T10:00:00Z', last_sign_in_at: null, other_venue_count: 2, is_self: false }],
      roles: ['manager', 'front_desk'] });
    expect(JSON.stringify(list)).not.toMatch(/HASH|TOKEN|secret|extra/);
  });
  it('defaults optional fields safely', () => {
    const [person] = projectVenueUsers({ ...rawList, users: [{ user_id: user, email: 'a@example.invalid', role: 'super_admin', status: 'inactive', protected: true, other_venue_count: -3 }] }).users;
    expect(person).toMatchObject({ full_name: null, protected: true, member_since: null, other_venue_count: 0, is_self: false, status: 'inactive' });
  });
  it('rejects malformed answers with the generic error', () => {
    for (const data of [{}, { ...rawList, venue: null }, { ...rawList, users: null }, { ...rawList, roles: 'manager' },
      { ...rawList, users: [{ ...rawUser, status: 'revoked' }] }, { ...rawList, users: [{ ...rawUser, role: null }] }, { ...rawList, users: [null] }]) {
      expect(() => projectVenueUsers(data as Record<string, unknown>)).toThrowError('genericError');
    }
  });
});
describe('venue users requests', () => {
  it('always names the venue and calls platform-identity-admin', async () => {
    invoke.mockResolvedValueOnce({ data: rawList, error: null });
    expect((await getVenueUsers(venue)).users).toHaveLength(1);
    expect(invoke).toHaveBeenLastCalledWith('platform-identity-admin', { body: { action: 'list', venue_id: venue } });
    invoke.mockResolvedValueOnce({ data: { success: true, changed: true, role: 'manager' }, error: null });
    // A caller can never aim a request at another venue through the body.
    await venueUsersRequest(venue, { action: 'set_role', user_id: user, role: 'manager', venue_id: 'other' });
    expect(invoke).toHaveBeenLastCalledWith('platform-identity-admin', { body: { action: 'set_role', user_id: user, role: 'manager', venue_id: venue } });
  });
  it('maps every backend slug to a message that exists in both languages', async () => {
    const contract: [number, string][] = [[401, 'unauthorized'], [403, 'forbidden'], [404, 'user_not_found'], [404, 'venue_not_found'], [404, 'not_member'],
      [409, 'cannot_change_self'], [409, 'protected_super_admin'], [409, 'already_member'], [409, 'account_unconfirmed'],
      [422, 'invalid_role'], [422, 'invalid_email'], [422, 'invalid_name'], [422, 'invalid_venue_id'], [422, 'invalid_user_id'], [422, 'display_staff_dedicated'], [422, 'invalid_action'],
      [429, 'rate_limited'], [502, 'invite_send_failed'], [502, 'recovery_send_failed'], [500, 'server_error']];
    expect(Object.keys(venueUserCodes).sort()).toEqual(contract.map(([, slug]) => slug).sort());
    for (const [status, slug] of contract) {
      refuse(status, slug);
      const key = await venueUsersRequest(venue, { action: 'list' }).then(() => '', staffErrorKey);
      expect(key).toBe(venueUserCodes[slug]);
      for (const locale of [en, es] as Record<string, string>[]) expect(locale[key]?.trim()).toBeTruthy();
    }
    expect([venueUserCodes.unauthorized, venueUserCodes.forbidden, venueUserCodes.rate_limited]).toEqual(['sessionExpired', 'accessDenied', 'rateLimited']);
  });
  it('an unknown slug collapses to a safe status-based message', async () => {
    refuse(403, 'something_new');
    expect(await venueUsersRequest(venue, { action: 'list' }).then(() => '', staffErrorKey)).toBe('accessDenied');
    refuse(500, 'boom: internal detail');
    expect(await venueUsersRequest(venue, { action: 'list' }).then(() => '', staffErrorKey)).toBe('genericError');
  });
});
describe('venue users labels', () => {
  it('labels venue roles apart from platform roles and keeps unknown slugs visible', () => {
    expect(venueRoleLabel(t(es), 'front_desk')).toBe('Recepción');
    expect(venueRoleLabel(t(es), 'super_admin')).toBe('Superadmin de venue (heredado)');
    expect(venueRoleLabel(t(en), 'super_admin')).toBe('Venue super admin (legacy)');
    expect(venueRoleLabel(t(en), 'night_auditor')).toBe('night_auditor');
    expect([slugLabel(t(es), 'staff.role', 'super_admin'), slugLabel(t(es), 'staff.role', 'support'), slugLabel(t(es), 'staff.role', 'operations')]).toEqual(['Admin', 'Soporte', 'Operaciones']);
    expect([slugLabel(t(en), 'staff.role', 'super_admin'), slugLabel(t(en), 'staff.role', 'support'), slugLabel(t(en), 'staff.role', 'operations')]).toEqual(['Admin', 'Support', 'Operations']);
    for (const status of ['active', 'invited', 'inactive']) expect(slugLabel(t(es), 'identity.status', status)).not.toBe(status);
  });
  it('hints at other venues only when there are any', () => {
    expect(otherVenuesLabel(t(es), 0)).toBe('');
    expect(otherVenuesLabel(t(es), 1)).toBe('+1 local más');
    expect(otherVenuesLabel(t(es), 2)).toBe('+2 locales más');
    expect(otherVenuesLabel(t(en), 3)).toBe('+3 more venues');
  });
});
