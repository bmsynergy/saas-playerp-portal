import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { callbackError, recoveryCallback, SIGNING_OUT_KEY, supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { AUTH_STORAGE_KEY } from '../lib/config';
import { clearVenueSelection, persist, recoveryPending } from '../lib/storage';
import { errorCode, PortalError } from '../lib/errors';

interface AuthState {
  session: Session | null; loading: boolean; expired: boolean; recovery: boolean; callbackInvalid: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>; expire(): Promise<void>; recover(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}
const Context = createContext<AuthState | null>(null);

function clearPrivateState() {
  void queryClient.cancelQueries(); queryClient.clear(); clearVenueSelection();
}
export function AuthProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [callbackInvalid, setCallbackInvalid] = useState(callbackError);
  const [recovery, setRecovery] = useState(recoveryCallback || recoveryPending());
  const current = useRef<Session | null>(null);
  const signingOut = useRef(false);
  const invalidating = useRef(false);

  const invalidate = useCallback(async () => {
    if (invalidating.current) return;
    invalidating.current = true;
    clearPrivateState(); current.current = null; setSession(null); setExpired(true);
    recoveryPending(false); setRecovery(false);
    // Local scope preserves other devices and the existing Lovable sessions.
    try { await supabase.auth.signOut({scope:'local'}); }
    finally { persist(AUTH_STORAGE_KEY, null); invalidating.current = false; }
  }, []);

  useEffect(() => {
    let mounted = true;
    const {data:{subscription}} = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      if (signingOut.current && next) return;
      const previous = current.current;
      if (previous?.user.id !== next?.user.id || event === 'SIGNED_OUT') clearPrivateState();
      if (event === 'SIGNED_OUT') {
        if (previous && !signingOut.current) setExpired(true);
        recoveryPending(false); setRecovery(false);
      }
      if (event === 'PASSWORD_RECOVERY') { recoveryPending(true); setRecovery(true); }
      if (event === 'TOKEN_REFRESHED') {
        // Do not run an Auth/RPC request inside the SDK's locked callback.
        setTimeout(() => { if (mounted) void queryClient.invalidateQueries(); }, 0);
      }
      current.current = next; setSession(next); if (!signingOut.current) setLoading(false);
    });
    void supabase.auth.initialize().then(({error}) => {
      if (mounted && error) setCallbackInvalid(true);
    });
    // getSession completes initialization also for rejected/expired callback links.
    void supabase.auth.getSession().then(({data,error}) => {
      if (!mounted) return;
      if (error && errorCode(error) === 'sessionExpired') void invalidate();
      setLoading(false);
    }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [invalidate]);

  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (checking || signingOut.current || !current.current) return;
      checking = true;
      try {
        const s = current.current;
        if (!s.expires_at || s.expires_at * 1000 - Date.now() < 90_000) {
          const {data,error} = await supabase.auth.refreshSession();
          if (error) {
            if (errorCode(error) === 'sessionExpired' || error.status === 400) await invalidate();
            // A temporary connection failure is not a revoked session; hide expired
            // private data until the SDK succeeds, without deleting a valid refresh.
            else if ((s.expires_at ?? 0) * 1000 <= Date.now()) { clearPrivateState(); setSession(null); setExpired(true); }
          } else if (!data.session) await invalidate();
        }
      } finally { checking = false; }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_STORAGE_KEY && e.newValue === null) { clearPrivateState(); current.current = null; setSession(null); setExpired(true); }
    };
    const timer = setInterval(() => void check(), 30_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    void check();
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('storage',onStorage); };
  }, [invalidate]);

  const login = async (email: string, password: string) => {
    signingOut.current = false;
    const {error} = await supabase.auth.signInWithPassword({email:email.trim(), password});
    if (error) throw error;
    setExpired(false); setCallbackInvalid(false); recoveryPending(false); setRecovery(false);
  };
  const logout = async () => {
    signingOut.current = true; setLoading(true); persist(SIGNING_OUT_KEY, '1');
    clearPrivateState(); current.current = null; setSession(null); recoveryPending(false); setRecovery(false);
    // On a network failure discard SDK memory by reloading after removing only
    // this portal's credentials. The user never remains looking at cached data.
    try {
      const {error} = await supabase.auth.signOut({scope:'local'});
      if (error) { persist(AUTH_STORAGE_KEY,null); window.location.replace('/auth/login'); }
    } catch {
      persist(AUTH_STORAGE_KEY,null); window.location.replace('/auth/login');
    } finally {persist(AUTH_STORAGE_KEY,null); persist(SIGNING_OUT_KEY,null); setExpired(false); signingOut.current=false; setLoading(false);}
  };
  const recover = async (email: string) => {
    const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {redirectTo: `${window.location.origin}/auth/password?recovery=1`});
    if (error) throw error;
  };
  const updatePassword = async (password: string) => {
    if (callbackInvalid || !current.current) throw new PortalError('invalidLink');
    if (password.length < 12) throw new PortalError('weakPassword');
    const {error} = await supabase.auth.updateUser({password});
    if (error) throw error;
    recoveryPending(false); setRecovery(false);
    clearPrivateState();
  };
  return <Context.Provider value={{session, loading, expired, recovery, callbackInvalid, login, logout, expire:invalidate, recover, updatePassword}}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context); if (!value) throw new Error('AuthProvider missing'); return value;
}
