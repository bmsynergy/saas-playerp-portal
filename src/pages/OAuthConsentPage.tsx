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
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);
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
        // PE-410: nothing is preselected, not even venues already granted to this assistant.
      } catch (error) {
        if (live) setErrorKey(consentErrorKey(error, 'oauth.loadFailed'));
      }
    })();
    return () => { live = false; active.current = false; };
  }, [requestId, expire]);

  // PE-410: several venues per connection. Any change to the selection asks for a fresh confirmation.
  function toggle(id: string) {
    if (deciding.current) return;
    setSelectedVenueIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
    setConfirmed(false); setErrorKey('');
  }

  async function decide(approve: boolean) {
    if (deciding.current || !context) return;
    // Only eligible venues of this context, in the order shown; the RPC revalidates ownership and pilot scope.
    const chosen = context.venues.filter(v => v.elegible !== false && selectedVenueIds.includes(v.venue_id)).map(v => v.venue_id);
    if (approve && (!confirmed || chosen.length === 0 || chosen.length !== selectedVenueIds.length)) return;
    deciding.current = true; setBusy(true); setErrorKey('');
    let redirecting = false;
    try {
      const { data, error } = await supabase.rpc('mcp_consent_decide', {
        p_request_id: requestId, p_approve: approve, p_venue_ids: approve ? chosen : null,
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

  return <OAuthConsentView context={context} selectedVenueIds={selectedVenueIds} confirmed={confirmed}
    busy={busy} errorKey={errorKey} onToggle={toggle} onConfirm={setConfirmed}
    onDecide={approve => void decide(approve)}/>;
}
