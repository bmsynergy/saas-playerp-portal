import { useLocale } from '../locales';

export type OAuthConsentViewProps = {
  context: {
    client: { id: string; name: string; redirect_host: string | null };
    venues: { venue_id: string; nombre: string; concedida: boolean }[];
  } | null;
  selectedVenueId: string;
  confirmed: boolean;
  busy: boolean;
  errorKey: string;
  onSelect: (id: string) => void;
  onConfirm: (checked: boolean) => void;
  onDecide: (approve: boolean) => void;
};

/** Presentation only: the parent owns the request, session, selection and decision. */
export function OAuthConsentView({
  context, selectedVenueId, confirmed, busy, errorKey, onSelect, onConfirm, onDecide,
}: OAuthConsentViewProps) {
  const { t } = useLocale();
  const selectedVenue = context?.venues.find((venue) => venue.venue_id === selectedVenueId);
  const canAllow = Boolean(selectedVenue && confirmed && !busy);

  if (!context) {
    return <section className="oauth-consent" aria-busy={!errorKey}>
      <h1>{t('oauth.title')}</h1>
      {errorKey
        ? <p className="oauth-error" role="alert">{t(errorKey)}</p>
        : <p role="status">{t('oauth.loading')}</p>}
    </section>;
  }

  return <section className="oauth-consent" aria-busy={busy}>
    <h1>{t('oauth.title')}</h1>
    <p><strong>{context.client.name || context.client.id}</strong> {t('oauth.wants')}</p>
    <p className="oauth-redirect">{t('oauth.redirectHost')} <strong>{context.client.redirect_host ?? '—'}</strong></p>
    <p>{t('oauth.readOnly')}</p>
    {context.venues.length === 0
      ? <p role="alert">{t('oauth.noVenues')}</p>
      : <fieldset disabled={busy}>
          <legend>{t('oauth.pickVenues')}</legend>
          {context.venues.map((venue) => <label key={venue.venue_id} className="oauth-venue">
            <input
              type="radio"
              name="venue"
              value={venue.venue_id}
              checked={selectedVenueId === venue.venue_id}
              onChange={() => onSelect(venue.venue_id)}
            />
            <span>{venue.nombre}</span>
          </label>)}
        </fieldset>}
    <p className="oauth-note">{t('oauth.replaceVenue')} {t('oauth.futureVenues')}</p>
    {selectedVenue && <label className="oauth-confirm">
      <input
        type="checkbox"
        checked={confirmed}
        disabled={busy}
        onChange={(event) => onConfirm(event.target.checked)}
      />
      <span>{t('oauth.confirmVenuePrefix')} <strong>{selectedVenue.nombre}</strong>{t('oauth.confirmVenueSuffix')}</span>
    </label>}
    {errorKey && <p className="oauth-error" role="alert">{t(errorKey)}</p>}
    <div className="oauth-actions">
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => onDecide(false)}>{t('oauth.deny')}</button>
      <button type="button" className="button button-primary" disabled={!canAllow} onClick={() => onDecide(true)}>{t('oauth.approve')}</button>
    </div>
  </section>;
}
