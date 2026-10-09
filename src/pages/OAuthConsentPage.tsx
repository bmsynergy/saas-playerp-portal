import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLocale } from '../locales';

// PE-386 / PE-390.3: consent screen of the mcp-analytics OAuth server (the gateway issues its own tokens).
// The owner's normal PlayERP session is only used here, to identify them and record which of their venues
// this AI client may read. The gateway redirects here with ?request_id=…; the decision returns redirect_to.
type ConsentContext = {
  request_id: string;
  client: { id: string; name: string; redirect_host: string | null };
  scope: string;
  connection_id: string | null;
  venues: { venue_id: string; nombre: string; concedida: boolean }[];
};

const KNOWN_ERRORS = ['mcp_request_unknown', 'mcp_request_expired', 'mcp_request_already_decided', 'mcp_consent_denied',
  'mcp_consent_no_venues', 'mcp_consent_not_owner'] as const;
const errorKey = (e: unknown) => {
  const msg = String((e as { message?: string })?.message ?? '');
  const hit = KNOWN_ERRORS.find((k) => msg.includes(k));
  return hit ? `oauth.err.${hit}` : 'oauth.failed';
};

export function OAuthConsentPage({ requestId }: { requestId: string }) {
  const { t } = useLocale();
  const [ctx, setCtx] = useState<ConsentContext | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void supabase.rpc('mcp_consent_context', { p_request_id: requestId }).then(({ data, error: e }) => {
      if (!live) return;
      if (e || !data) { setError(t(errorKey(e))); return; }
      const c = data as ConsentContext;
      setCtx(c);
      // Keep the current selection (venues already granted to this connection); a single venue is preselected.
      const granted = c.venues.filter((v) => v.concedida).map((v) => v.venue_id);
      setPicked(new Set(granted.length ? granted : c.venues.length === 1 ? [c.venues[0].venue_id] : []));
    });
    return () => { live = false; };
  }, [requestId, t]);

  function toggle(id: string) {
    setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function decide(approve: boolean) {
    setBusy(true); setError('');
    const { data, error: e } = await supabase.rpc('mcp_consent_decide', {
      p_request_id: requestId, p_approve: approve, p_venue_ids: approve ? [...picked] : null,
    });
    const to = (data as { redirect_to?: string } | null)?.redirect_to;
    if (e || !to) { setError(t(errorKey(e))); setBusy(false); return; }
    window.location.assign(to);
  }

  if (error && !ctx) return <section className="oauth-consent"><h1>{t('oauth.title')}</h1><p role="alert">{error}</p></section>;
  if (!ctx) return <section className="oauth-consent"><p>{t('loadingTitle')}</p></section>;
  return <section className="oauth-consent">
    <h1>{t('oauth.title')}</h1>
    <p><strong>{ctx.client.name || ctx.client.id}</strong> {t('oauth.wants')}</p>
    <p className="oauth-redirect">{t('oauth.redirectHost')} <strong>{ctx.client.redirect_host ?? '—'}</strong></p>
    <p>{t('oauth.readOnly')}</p>
    {ctx.venues.length === 0 ? <p role="alert">{t('oauth.noVenues')}</p> :
      <fieldset><legend>{t('oauth.pickVenues')}</legend>
        {ctx.venues.map((v) => <label key={v.venue_id} className="oauth-venue">
          <input type="checkbox" name="venue" value={v.venue_id} checked={picked.has(v.venue_id)} onChange={() => toggle(v.venue_id)} /> {v.nombre}
        </label>)}
      </fieldset>}
    <p className="oauth-note">{t('oauth.futureVenues')}</p>
    {error && <p role="alert">{error}</p>}
    <div className="oauth-actions">
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void decide(false)}>{t('oauth.deny')}</button>
      <button type="button" className="button" disabled={busy || picked.size === 0} onClick={() => void decide(true)}>{t('oauth.approve')}</button>
    </div>
  </section>;
}
