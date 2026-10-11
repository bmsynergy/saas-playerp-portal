import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { OAuthConsentView } from '../components/OAuthConsentView';
import { consentErrorKey, consentRedirect, validConsentContext, type ConsentContext } from '../lib/oauthConsent';

// The route keys this controller by request and signed-in user. Ownership and pilot
// admission remain enforced by the existing RPCs, never by client-side role claims.
export function OAuthConsentPage({ requestId }: { requestId: string }) {
  const { expire } = useAuth();
  const [context, setContext] = useState<ConsentContext | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [busy, setBusy] = useState(false);
  const deciding = useRef(false);
  const active = useRef(false);

  useEffect(() => {
    let live = true;
    active.current = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('mcp_consent_context', { p_request_id: requestId });
        if (!live) return;
        if (error) {
          const key = consentErrorKey(error, 'oauth.loadFailed');
          if (key === 'oauth.sessionExpired') { await expire(); return; }
          setErrorKey(key); return;
        }
        if (!validConsentContext(data, requestId)) { setErrorKey('oauth.invalid'); return; }
        setContext(data);
        // Even one available or previously granted venue needs a fresh explicit choice.
      } catch (error) {
        if (live) setErrorKey(consentErrorKey(error, 'oauth.loadFailed'));
      }
    })();
    return () => { live = false; active.current = false; };
  }, [requestId, expire]);

  function select(id: string) {
    if (deciding.current) return;
    setSelectedVenueId(id); setConfirmed(false); setErrorKey('');
  }

  async function decide(approve: boolean) {
    if (deciding.current || !context) return;
    if (approve && (!confirmed || !context.venues.some(v => v.venue_id === selectedVenueId))) return;
    deciding.current = true; setBusy(true); setErrorKey('');
    let redirecting = false;
    try {
      const { data, error } = await supabase.rpc('mcp_consent_decide', {
        p_request_id: requestId, p_approve: approve, p_venue_ids: approve ? [selectedVenueId] : null,
      });
      if (!active.current) return;
      if (error) {
        const key = consentErrorKey(error);
        if (key === 'oauth.sessionExpired') { await expire(); return; }
        setErrorKey(key); return;
      }
      const to = consentRedirect((data as { redirect_to?: unknown } | null)?.redirect_to, context.client.redirect_host);
      if (!to) { setErrorKey('oauth.invalid'); setContext(null); return; }
      window.location.assign(to);
      redirecting = true;
    } catch (error) {
      if (active.current) setErrorKey(consentErrorKey(error));
    } finally {
      if (!redirecting) {
        deciding.current = false;
        if (active.current) setBusy(false);
      }
    }
  }

  return <OAuthConsentView context={context} selectedVenueId={selectedVenueId} confirmed={confirmed}
    busy={busy} errorKey={errorKey} onSelect={select} onConfirm={setConfirmed}
    onDecide={approve => void decide(approve)}/>;
}
