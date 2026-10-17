import { useMemo } from 'react';
import { psLinkStateClass, psLinkStateKey, reportedOr, type PsDeviceLink, type PsLinkState } from '../lib/psLink';
import { useLocale } from '../locales';

// PE-462: the single badge for a Print Server's preparation/venue link state.
export function PsLinkStateBadge({ state, testId }: { state: PsLinkState; testId?: string }) {
  const { t } = useLocale();
  return <span className={`server-status ${psLinkStateClass(state)}`} data-testid={testId ?? 'ps-link-state'} data-link-state={state}><span className="badge-dot"/>{t(psLinkStateKey(state))}</span>;
}

// Identity from the link DTO plus what the device itself reported ("Pending" when it has not).
export function PsLinkFacts({ link }: { link: PsDeviceLink }) {
  const { t, locale } = useLocale();
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v && Number.isFinite(Date.parse(v)) ? f.format(new Date(v)) : null; }, [locale]);
  const pending = t('psLink.pending');
  return <dl className="dev-facts" data-testid="ps-link-facts">
    <div><dt>{t('state')}</dt><dd><PsLinkStateBadge state={link.state}/></dd></div>
    <div><dt>{t('psLink.name')}</dt><dd>{link.display_name}</dd></div>
    <div><dt>{t('dev.serial')}</dt><dd className="ps-mono" data-testid="ps-link-serial">{link.serial || t('notProvided')}</dd></div>
    <div><dt>{t('fw.model')}</dt><dd>{link.model_label ?? (link.model || t('notProvided'))}</dd></div>
    <div><dt>{t('inv.venue')}</dt><dd>{link.venue_name ?? t('inv.unassigned')}</dd></div>
    <div><dt>{t('psLink.firmware')}</dt><dd className="ps-mono">{reportedOr(link.reported.firmware_version, pending)}</dd></div>
    <div><dt>{t('ps.hostname')}</dt><dd className="ps-mono" data-testid="ps-link-hostname">{reportedOr(link.reported.hostname, pending)}</dd></div>
    <div><dt>{t('psLink.lastSeen')}</dt><dd>{reportedOr(date(link.reported.last_seen_at), pending)}</dd></div>
  </dl>;
}
