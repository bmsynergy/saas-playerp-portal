import { createClient } from '@supabase/supabase-js';
import { persist, stored } from './storage';
import { AUTH_STORAGE_KEY, SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './config';

// Finish an interrupted logout before constructing the SDK, so a reload cannot
// restore credentials that the user already chose to discard.
export const SIGNING_OUT_KEY = 'playerp.portal.signing-out';
if (stored(SIGNING_OUT_KEY)) { persist(AUTH_STORAGE_KEY, null); persist(SIGNING_OUT_KEY, null); }
// Capture callback flags before the SDK consumes and removes the URL fragment.
const initialHash = new URLSearchParams(window.location.hash.slice(1));
const initialQuery = new URLSearchParams(window.location.search);
export const callbackError = initialHash.has('error') || initialQuery.has('error');
export const invitationCallback = initialHash.get('type') === 'invite';
export const recoveryCallback = initialHash.get('type') === 'recovery';
// Invalid callbacks must not leave bearer tokens or server errors in the address bar.
if (callbackError) window.history.replaceState(null, '', '/auth/password?invalid=1');
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !callbackError, flowType: 'implicit', storageKey: AUTH_STORAGE_KEY },
});
