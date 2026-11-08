import { ExternalLink } from 'lucide-react';
import type { ResolvedDevice } from '../lib/psResolvedDevice';
import type { FleetServer } from '../lib/printFleet';
import { useLocale } from '../locales';

type Props = {
  device: ResolvedDevice;
  server: FleetServer | null;
  portalUrl: string | null;
};

export function PrintServerAbout({ device, server, portalUrl }: Props) {
  const { locale, t } = useLocale();
  const lastSeen = server?.last_seen_at ?? device.runtime?.last_seen_at ?? null;
  const parsedLastSeen = lastSeen ? Date.parse(lastSeen) : NaN;
  const localAddress = server?.local_address ?? null;
  const localPort = server?.local_port ?? null;
  const model = [device.model, device.arch].filter(Boolean).join(' · ');
  const facts = [
    { label: t('psAbout.serial'), value: device.serial },
    { label: t('psAbout.modelArch'), value: model },
    { label: t('psAbout.firmware'), value: device.runtime?.firmware_version ?? device.compat.installed_version },
    { label: t('psAbout.hostname'), value: server?.hostname ?? device.runtime?.hostname },
    { label: t('psAbout.lastConnection'), value: Number.isFinite(parsedLastSeen) ? new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsedLastSeen) : null },
  ];
  return <section className="detail-panel ps-about" data-testid="ps-about" aria-labelledby="ps-about-title">
    <div className="section-heading"><div><p className="eyebrow">{t('printServer')}</p><h2 id="ps-about-title">{t('psAbout.title')}</h2></div></div>
    <dl className="ps-about-facts">
      {facts.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd className="ps-mono">{value || t('notProvided')}</dd></div>)}
      <div className="ps-about-address"><dt>{t('psAbout.localAddress')}</dt><dd className="ps-mono">{localAddress ? (portalUrl ? <a href={portalUrl} target="_blank" rel="noopener noreferrer" title={portalUrl}>{`${localAddress}${localPort ? `:${localPort}` : ''}`}</a> : `${localAddress}${localPort ? `:${localPort}` : ''}`) : t('notProvided')}</dd></div>
    </dl>
    {portalUrl && <div className="ps-about-portal"><a href={portalUrl} target="_blank" rel="noopener noreferrer" className="button button-secondary" data-testid="ps-open-portal"><ExternalLink size={16} aria-hidden="true"/>{t('psAbout.openPortal')}</a><p>{t('psAbout.localHelp')}</p></div>}
  </section>;
}
