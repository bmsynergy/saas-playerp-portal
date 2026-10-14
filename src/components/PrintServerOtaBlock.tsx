import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getPanelOta, statusClass, updateOwnedDevice, type PanelOta } from '../lib/ota';
import { psErrorKey } from '../lib/printServerApi';
import { useLocale } from '../locales';
import { FirmwareUpdateAction } from './FirmwareUpdateAction';

type Confirmation = { printServerId: string; deviceId: string; editionId: string; version: string; installed: string };

export function PrintServerOtaBlock({ venueId }: { venueId: string }) {
  const { t, locale } = useLocale();
  const { session } = useAuth();
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const q = useQuery({ queryKey: ['ps-panel-ota', session?.user.id, venueId], queryFn: ({ signal }) => getPanelOta(venueId, signal), refetchInterval: 10_000 });
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v ? f.format(new Date(v)) : null; }, [locale]);
  const label = (prefix: string, v: string | null) => { if (!v) return null; const k = `${prefix}.${v}`; const out = t(k); return out === k ? v : out; };
  const canOffer = (p: PanelOta) => !!(p.can_update && p.device_id && p.latest_stable?.edition_id && p.installed_version && !q.isFetching && !q.isError);
  const matches = (p: PanelOta | undefined, c: Confirmation | null) => !!(p && c && canOffer(p) && p.print_server_id === c.printServerId && p.device_id === c.deviceId && p.latest_stable?.edition_id === c.editionId && p.latest_stable.version === c.version && p.installed_version === c.installed);
  const reasonText = (reason: string | null) => {
    if (!reason) return t('firmware.ownerReadOnly');
    const key = `adminDevice.reason.${reason}`;
    return t(key) === key ? t('adminDevice.reason.metadata_missing') : t(key);
  };

  async function review(p: PanelOta) {
    if (!canOffer(p) || busy) return;
    setNotice('');
    const refreshed = await q.refetch();
    const fresh = refreshed.data?.find(item => item.print_server_id === p.print_server_id);
    if (refreshed.isError || !fresh || !canOffer(fresh) || fresh.device_id !== p.device_id || fresh.installed_version !== p.installed_version || fresh.latest_stable?.edition_id !== p.latest_stable?.edition_id) {
      setConfirm(null); setNotice(t('adminDevice.updateChanged')); return;
    }
    setConfirm({ printServerId: fresh.print_server_id, deviceId: fresh.device_id!, editionId: fresh.latest_stable!.edition_id, version: fresh.latest_stable!.version, installed: fresh.installed_version! });
  }

  async function submit() {
    if (!confirm || busy) return;
    setBusy(true); setNotice('');
    try {
      const refreshed = await q.refetch();
      const fresh = refreshed.data?.find(item => item.print_server_id === confirm.printServerId);
      if (refreshed.isError || !matches(fresh, confirm)) { setConfirm(null); setNotice(t('adminDevice.updateChanged')); return; }
      await updateOwnedDevice(venueId, confirm.deviceId, confirm.editionId, confirm.installed);
      setConfirm(null); setNotice(t('adminDevice.updateQueued'));
      await q.refetch();
    } catch (error) {
      const key = psErrorKey(error);
      setNotice(t(key) === key ? t('genericError') : t(key));
    } finally { setBusy(false); }
  }

  return <section className="detail-panel" aria-labelledby="ps-ota-title" data-testid="ps-ota-block">
    <div className="section-heading"><div><p className="eyebrow">{t('ota.owner.eyebrow')}</p><h2 id="ps-ota-title">{t('ota.owner.title')}</h2></div><span className="section-icon"><PackageCheck size={20}/></span></div>
    {q.isError ? <div className="inline-empty">{t(psErrorKey(q.error) === 'accessDenied' ? 'accessDenied' : 'genericError')}<button type="button" className="button button-secondary" onClick={()=>void q.refetch()}>{t('refresh')}</button></div>
      : !q.data ? <div className="inline-empty firmware-loading-status" role="status"><span className="spinner" aria-hidden="true"/>{t('dev.loading')}</div>
      : q.data.length === 0 ? <div className="inline-empty">{t('ps.noServer')}</div>
      : q.data.map(p => <dl key={p.print_server_id} className="dev-facts" data-testid={`ps-ota-${p.print_server_id}`}>
        {q.data.length > 1 && <div className="dev-wide"><dt>{t('ps.hostname')}</dt><dd>{p.hostname ?? t('notProvided')}</dd></div>}
        <div><dt>{t('ota.installed')}</dt><dd data-testid="ps-ota-installed">{p.installed_version ?? t('notProvided')}</dd></div>
        <div><dt>{t('adminDevice.latestStable')}</dt><dd data-testid="ps-ota-latest">{p.latest_stable?.version ?? t(p.availability === 'unavailable' ? 'adminDevice.noStable' : 'notProvided')}</dd></div>
        <div className="dev-wide"><dt>{t('firmware.compatibility')}</dt><dd>{p.model ?? t('notProvided')} · {p.arch ?? t('notProvided')} · {t('firmware.stableRing')}</dd></div>
        <div className="dev-wide"><dt>{t('adminDevice.update')}</dt><dd>
          <FirmwareUpdateAction testId="owner-device-update" disabled={!canOffer(p) || busy} onClick={() => void review(p)} reason={!canOffer(p) && !q.isFetching ? reasonText(p.reason) : null} loading={busy && confirm?.printServerId === p.print_server_id}/>
        </dd></div>
        {p.desired_version && <div><dt>{t('ota.desired')}</dt><dd data-testid="ps-ota-desired">{p.desired_version}</dd></div>}
        <div className="dev-wide"><dt>{t('state')}</dt><dd><span className={`server-status ${p.status === 'none' ? 'server-pending' : statusClass(p.status)}`} data-testid="ps-ota-status" data-status={p.status}><span className="badge-dot"/>{p.status === 'none' ? t('ota.owner.noUpdate') : label('ota.status', p.status)}{p.status === 'in_progress' && p.phase ? ` · ${label('ota.phase', p.phase)}` : ''}{p.status === 'in_progress' && p.progress !== null ? ` · ${t('list.generalProgress')}: ${p.progress}%` : ''}</span>{p.updated_at && p.status !== 'none' && <small className="ps-sub">{date(p.updated_at)}</small>}</dd></div>
      </dl>)}
    {q.isFetching && q.data && <p className="firmware-loading-status" role="status"><span className="spinner" aria-hidden="true"/>{t('dev.loading')}</p>}
    {notice && <p role="status" className="ps-result">{notice}</p>}
    {confirm && <div className="admin-device-confirm" role="group" aria-label={t('adminDevice.confirmUpdateTitle')}>
      <p>{t('adminDevice.confirmUpdate').replace('{version}', confirm.version).replace('{serial}', q.data?.find(item => item.print_server_id === confirm.printServerId)?.hostname ?? confirm.deviceId).replace('{installed}', confirm.installed)}</p>
      {!matches(q.data?.find(item => item.print_server_id === confirm.printServerId), confirm) && <p role="status">{t('adminDevice.updateChanged')}</p>}
      <div className="staff-actions"><button type="button" className="button button-primary" disabled={busy || !matches(q.data?.find(item => item.print_server_id === confirm.printServerId), confirm)} onClick={() => void submit()}>{t('adminDevice.update')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirm(null)}>{t('staff.cancel')}</button></div>
    </div>}
  </section>;
}
