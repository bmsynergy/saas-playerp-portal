import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { getPanelOta, statusClass } from '../lib/ota';
import { psErrorKey } from '../lib/printServerApi';
import { useLocale } from '../locales';

// PE-385: read-only software version of the venue's Print Server(s). No deploy controls;
// ps_panel_ota answers 42501 for a venue the user does not belong to.
export function PrintServerOtaBlock({ venueId }: { venueId: string }) {
  const { t, locale } = useLocale();
  const q = useQuery({ queryKey: ['ps-panel-ota', venueId], queryFn: ({ signal }) => getPanelOta(venueId, signal), refetchInterval: 10_000 });
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v ? f.format(new Date(v)) : null; }, [locale]);
  const label = (prefix: string, v: string | null) => { if (!v) return null; const k = `${prefix}.${v}`; const out = t(k); return out === k ? v : out; };
  return <section className="detail-panel" aria-labelledby="ps-ota-title" data-testid="ps-ota-block">
    <div className="section-heading"><div><p className="eyebrow">{t('ota.owner.eyebrow')}</p><h2 id="ps-ota-title">{t('ota.owner.title')}</h2></div><span className="section-icon"><PackageCheck size={20}/></span></div>
    {q.isError && !q.data ? <div className="inline-empty">{t(psErrorKey(q.error) === 'accessDenied' ? 'accessDenied' : 'genericError')}</div>
      : !q.data ? <div className="inline-empty">{t('dev.loading')}</div>
      : q.data.length === 0 ? <div className="inline-empty">{t('ps.noServer')}</div>
      : q.data.map(p => <dl key={p.print_server_id} className="dev-facts" data-testid={`ps-ota-${p.print_server_id}`}>
        {q.data.length > 1 && <div className="dev-wide"><dt>{t('ps.hostname')}</dt><dd>{p.hostname ?? t('notProvided')}</dd></div>}
        <div><dt>{t('ota.installed')}</dt><dd data-testid="ps-ota-installed">{p.installed_version ?? t('notProvided')}</dd></div>
        {p.desired_version && <div><dt>{t('ota.desired')}</dt><dd data-testid="ps-ota-desired">{p.desired_version}</dd></div>}
        <div className="dev-wide"><dt>{t('state')}</dt><dd><span className={`server-status ${p.status === 'none' ? 'server-pending' : statusClass(p.status)}`} data-testid="ps-ota-status" data-status={p.status}><span className="badge-dot"/>{p.status === 'none' ? t('ota.owner.noUpdate') : label('ota.status', p.status)}{p.status === 'in_progress' && p.phase ? ` · ${label('ota.phase', p.phase)}` : ''}{p.status === 'in_progress' && p.progress !== null ? ` · ${p.progress}%` : ''}</span>{p.updated_at && p.status !== 'none' && <small className="ps-sub">{date(p.updated_at)}</small>}</dd></div>
      </dl>)}
  </section>;
}
