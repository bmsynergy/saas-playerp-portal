import { useEffect, useState } from 'react';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useLocale } from '../locales';
import type { OwnerVenue } from '../lib/types';

// PE-386: consent screen of the PlayERP OAuth 2.1 server (Supabase Auth -> Site URL + /oauth/consent).
// The owner picks ONE of their own venues for the AI client; the MCP gateway only ever serves that venue.
export function OAuthConsentPage({ authorizationId, venues }: { authorizationId: string; venues: OwnerVenue[] }) {
  const { t } = useLocale();
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [venueId, setVenueId] = useState(venues.length === 1 ? venues[0].id : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: e }) => {
      if (!live) return;
      if (e || !data) { setError(t('oauth.invalid')); return; }
      // Already consented: Supabase Auth hands back the client redirect straight away.
      if (data.redirect_url && !data.client) { window.location.assign(data.redirect_url); return; }
      setDetails(data);
    });
    return () => { live = false; };
  }, [authorizationId, t]);

  async function decide(approve: boolean) {
    setBusy(true); setError('');
    try {
      if (approve) {
        const { error: e } = await supabase.rpc('mcp_authorize_venue', { p_client_id: details!.client.id, p_venue_id: venueId });
        if (e) throw e;
      }
      const { data, error: e } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (e || !data?.redirect_url) throw e ?? new Error('no redirect');
      window.location.assign(data.redirect_url);
    } catch {
      setError(t('oauth.failed')); setBusy(false);
    }
  }

  if (error && !details) return <section className="oauth-consent"><h1>{t('oauth.title')}</h1><p role="alert">{error}</p></section>;
  if (!details) return <section className="oauth-consent"><p>{t('loadingTitle')}</p></section>;
  return <section className="oauth-consent">
    <h1>{t('oauth.title')}</h1>
    <p><strong>{details.client.name || details.client.id}</strong> {t('oauth.wants')}</p>
    <p>{t('oauth.readOnly')}</p>
    {venues.length === 0 ? <p role="alert">{t('oauth.noVenues')}</p> :
      <fieldset><legend>{t('oauth.pickVenue')}</legend>
        {venues.map(v => <label key={v.id} className="oauth-venue">
          <input type="radio" name="venue" value={v.id} checked={venueId === v.id} onChange={() => setVenueId(v.id)} /> {v.name}
        </label>)}
      </fieldset>}
    {error && <p role="alert">{error}</p>}
    <div className="oauth-actions">
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void decide(false)}>{t('oauth.deny')}</button>
      <button type="button" className="button" disabled={busy || !venueId} onClick={() => void decide(true)}>{t('oauth.approve')}</button>
    </div>
  </section>;
}
