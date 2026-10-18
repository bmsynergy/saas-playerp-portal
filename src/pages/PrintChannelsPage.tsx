import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronDown, RadioTower, RefreshCw } from 'lucide-react';
import { useLocale } from '../locales';
import { useChannelsPage } from '../lib/useChannelsPage';
import { type OtaChannelRow, type Ring } from '../lib/ota';
import { setPrintServerChannel, adminDeviceErrorKey, type AdminVenueOption } from '../lib/psAdminDevice';
import { VenueCombobox } from '../components/VenueCombobox';
import { invalidatePsViews } from '../lib/psInvalidation';
import { psErrorKey } from '../lib/printServerApi';
import { AdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination } from '../components/PrintListPagination';
import { PortalDialog } from '../components/PortalDialog';
import { PrintServersTabs } from './PrintFirmwaresPage';

const RINGS: Ring[] = ['lab', 'canary', 'general'];
type Change = { row: OtaChannelRow; to: Ring };

export function PrintChannelsPage() {
  const { t, locale } = useLocale();
  const location = useLocation();
  const [params] = useSearchParams();
  const groupId = params.get('group');
  const page = useChannelsPage();
  const cache = useQueryClient();
  const [change, setChange] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = page.query.data?.items ?? [];
  const selectedRing = RINGS.find(ring => ring === page.filters.channel);
  const countFormat = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US');
  const ringName = (ring: Ring) => t(`firmware.ring.${ring}`);
  const statusName = (status: string) => {
    const key = `pe474.channels.status.${status}` as Parameters<typeof t>[0];
    const value = t(key);
    return value === key ? status : value;
  };
  const venue: AdminVenueOption | null = page.filters.venue_id ? {
    id: page.filters.venue_id, name: page.venueLabel || page.filters.venue_id,
    slug: null, city: null, state: null, is_active: true, assigned_device: null,
  } : null;
  const openChange = (row: OtaChannelRow, to: Ring) => {
    if (row.channel === to) return;
    setChange({ row, to }); setNotice(''); setNoticeError(false);
  };
  async function confirm() {
    if (!change || busy || page.query.isFetching || page.query.isError || change.to === change.row.channel) return;
    const current = page.query.data?.items.find(item => item.print_server_id === change.row.print_server_id);
    if (!current || current.channel !== change.row.channel || current.channel_revision !== change.row.channel_revision) {
      setChange(null); setNoticeError(true); setNotice(t('pe474.channels.concurrent')); return;
    }
    setBusy(true);
    try {
      const result = await setPrintServerChannel(change.row.print_server_id, change.to, change.row.channel, change.row.channel_revision);
      setChange(null); setNoticeError(false); setNotice(t(result.changed ? 'pe474.channels.changed' : 'pe474.channels.unchanged'));
      await invalidatePsViews(cache);
    } catch (err) {
      const key = adminDeviceErrorKey(err), label = t(key);
      setChange(null); setNoticeError(true);
      setNotice(key === 'adminDevice.error.channel_changed' ? t('pe474.channels.concurrent') : label === key ? t('genericError') : label);
      await page.query.refetch().catch(() => {});
    } finally { setBusy(false); }
  }
  return <div className="page-stack staff-page" data-testid="channels-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('pe474.channels.title')}</h1><p>{t('pe474.channels.lead')}</p></div><div className="heading-accent" aria-hidden="true"><RadioTower size={30}/></div></div>
    <PrintServersTabs/>
    <section className="servers-panel channels-panel" aria-labelledby="pe474-channels-list">
      <div className="section-heading"><div><h2 id="pe474-channels-list">{t('pe474.channels.list')}</h2><p className="owner-section-lead">{t('pe474.channels.groupRule')}</p></div><button className="button button-secondary" type="button" disabled={page.query.isFetching} onClick={() => void page.query.refetch()}><RefreshCw size={15}/>{t('refresh')}</button></div>
      <p className="channels-scope" id="channels-count-scope">{t('pe474.channels.countScope')}</p>
      <div className="channels-ring-grid" role="group" aria-label={t('pe474.channels.chooseRing')} aria-describedby="channels-count-scope" data-testid="channels-counts">
        {RINGS.map(ring => <button key={ring} type="button" className={`channels-ring-card${selectedRing === ring ? ' is-selected' : ''}`} aria-pressed={selectedRing === ring} disabled={page.query.isError} data-testid={`channels-ring-${ring}`} onClick={() => { page.set('channel', ring); setExpanded(null); }}>
          <span className="channels-ring-name">{ringName(ring)}</span><strong className="channels-ring-count">{page.query.data?.counts?.[ring] == null ? '–' : countFormat.format(page.query.data.counts[ring])}</strong><span className="channels-ring-caption">{t('pe474.channels.servers')}</span>
        </button>)}
      </div>
      {groupId && <p className="fw-notice">{t('pe474.channels.groupFilter')} <button className="staff-action-link" type="button" onClick={() => page.set('group_id', '')}>{t('pe474.channels.clearGroup')}</button></p>}
      {selectedRing && <div className="admin-list-toolbar channels-toolbar"><AdminListFilters id="channels" filters={page.filters} set={page.set} clear={page.clear} clearDisabled={!page.filters.query && !page.filters.status && !page.filters.venue_id && !page.filters.group_id} statuses={['active', 'pending', 'revoked', 'online', 'offline', 'all'].map(value => ({ value, label: statusName(value) }))} afterStatus={<label><span>{t('inv.venue')}</span><VenueCombobox emptyLabel={t('ps.filter.allVenues')} value={venue} onChange={page.setVenue} testId="channels-venue"/></label>}/><span className="directory-count" data-testid="channels-total">{t('pe474.channels.total').replace('{n}', countFormat.format(page.pagination.total))}</span></div>}
      {notice && <div role={noticeError ? 'alert' : 'status'} className={`ps-result ${noticeError ? 'ps-result-error' : 'ps-result-ok'}`}>{noticeError ? <AlertTriangle size={16}/> : <Check size={16}/>}<span>{notice}</span></div>}
      {page.query.isError ? <div role="alert" className="form-error">{t(psErrorKey(page.query.error))}<button className="button button-secondary" type="button" onClick={() => void page.query.refetch()}>{t('refresh')}</button></div>
        : page.query.isPending ? <p role="status" className="inline-empty">{t('dev.loading')}</p>
        : !selectedRing ? <p className="inline-empty channels-choose-message">{t('pe474.channels.chooseFirst')}</p>
        : rows.length === 0 ? <p className="inline-empty">{t('list.noMatches')}</p>
        : <ol className="channels-list" data-testid="channels-list">{rows.map(row => {
          const name = row.name || row.hostname || row.serial || row.print_server_id;
          const serial = row.serial && row.serial !== name ? row.serial : null;
          const open = expanded === row.print_server_id;
          const canChange = !busy && !page.query.isFetching && !page.query.isError && !row.update_in_progress && row.status === 'active';
          return <li key={row.print_server_id} className={`channels-item${open ? ' is-open' : ''}`} data-testid={`channel-row-${row.print_server_id}`}>
            <h3 className="channels-item-heading"><button type="button" className="channels-item-toggle" aria-expanded={open} aria-controls={open ? `channel-detail-${row.print_server_id}` : undefined} onClick={() => setExpanded(open ? null : row.print_server_id)}>
              <span className="channels-item-main"><strong>{name}</strong>{serial && <span className="ps-mono">{serial}</span>}</span>
              <span className="channels-item-venue">{row.venue_name || t('inv.unassigned')}</span>
              <span className="channels-item-state"><span className={`server-status ${row.online ? 'server-online' : 'server-offline'}`}>{t(`ps.state.${row.online ? 'online' : 'offline'}`)}</span><span>{statusName(row.status)}</span></span>
              <ChevronDown size={18} className="channels-chevron" aria-hidden="true"/>
            </button></h3>
            {open && <div id={`channel-detail-${row.print_server_id}`} className="channels-item-detail">
              <dl className="channels-facts">
                <div><dt>{t('ota.ring')}</dt><dd><span className={`server-status ota-ring-${row.channel}`}>{ringName(row.channel)}</span></dd></div>
                <div><dt>{t('ota.installed')}</dt><dd>{row.installed_version || t('notProvided')}</dd></div>
                <div><dt>{t('psLink.lastSeen')}</dt><dd>{row.last_seen_at && Number.isFinite(Date.parse(row.last_seen_at)) ? new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.last_seen_at)) : t('notProvided')}</dd></div>
                <div><dt>{t('fw.model')}</dt><dd>{row.model || t('notProvided')}</dd></div>
                <div><dt>{t('fw.arch')}</dt><dd>{row.arch || t('notProvided')}</dd></div>
              </dl>
              <div className="channels-item-actions">{row.href && <Link className="button button-secondary" to={row.href} state={{ channelsReturnTo: location.pathname + location.search }}>{t('pe474.channels.openDevice')}</Link>}
                <label className="channels-change-label"><span>{t('pe474.channels.change')}</span><select value={row.channel} disabled={!canChange} aria-label={`${t('pe474.channels.change')}: ${name}`} onChange={event => openChange(row, event.target.value as Ring)}>{RINGS.map(ring => <option key={ring} value={ring}>{ringName(ring)}</option>)}</select></label></div>
              </div>}
          </li>;
        })}</ol>}
      {selectedRing && !page.query.isPending && !page.query.isError && <PrintListPagination id="channels" pagination={page.pagination} disabled={page.query.isFetching} fixedSize/>}
    </section>
    {change && <PortalDialog title={t('pe474.channels.change')} titleId="channel-confirm-title" descriptionId="channel-confirm-description" alert dismissible={!busy} onClose={() => setChange(null)} actions={<><button className="button button-secondary" disabled={busy} onClick={() => setChange(null)}>{t('staff.cancel')}</button><button className="button button-primary" disabled={busy || page.query.isFetching || page.query.isError} onClick={() => void confirm()}>{t('staff.confirm')}</button></>}><p id="channel-confirm-description">{t('pe474.channels.confirm').replace('{serial}', change.row.serial || change.row.name || change.row.print_server_id).replace('{from}', ringName(change.row.channel)).replace('{to}', ringName(change.to))}</p><p className="ps-dialog-warning"><AlertTriangle size={16}/>{t('pe474.channels.noInstall')}</p></PortalDialog>}
  </div>;
}
