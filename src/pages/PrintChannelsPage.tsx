import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, RadioTower, RefreshCw } from 'lucide-react';
import { useLocale } from '../locales';
import { useOtaPage } from '../lib/useOtaPage';
import { type OtaChannelRow, type Ring } from '../lib/ota';
import { setPrintServerChannel, adminDeviceErrorKey, type AdminVenueOption } from '../lib/psAdminDevice';
import { VenueCombobox } from '../components/VenueCombobox';
import { invalidatePsViews } from '../lib/psInvalidation';
import { psErrorKey } from '../lib/printServerApi';
import { AdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination } from '../components/PrintListPagination';
import { PortalDialog } from '../components/PortalDialog';
import { PrintServersTabs } from './PrintFirmwaresPage';

const RINGS: Ring[] = ['lab','canary','general'];
type Change = { row: OtaChannelRow; to: Ring };

export function PrintChannelsPage() {
  const { t } = useLocale();
  const [params] = useSearchParams();
  const groupId = params.get('group');
  const page = useOtaPage('channels', groupId);
  const linkedQuery=params.get('q');
  useEffect(()=>{if(linkedQuery&&page.filters.query!==linkedQuery)page.set('query',linkedQuery);},[linkedQuery]);
  const cache = useQueryClient();
  const [change, setChange] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError,setNoticeError]=useState(false);
  const [venue, setVenue] = useState<AdminVenueOption|null>(null);
  const rows = page.query.data?.items ?? [];
  const ringName = (ring: Ring) => t(`ota.ring.${ring}`);
  const openChange = (row: OtaChannelRow, to: Ring) => { setChange({row,to}); setNotice('');setNoticeError(false); };
  async function confirm() {
    if (!change || busy || page.query.isFetching || page.query.isError || change.to === change.row.channel) return;
    const current = page.query.data?.items.find(item=>item.print_server_id===change.row.print_server_id);
    if (!current || current.channel !== change.row.channel || current.channel_revision !== change.row.channel_revision) { setChange(null); setNoticeError(true);setNotice(t('pe474.channels.concurrent')); return; }
    setBusy(true);
    try {
      const result = await setPrintServerChannel(change.row.print_server_id,change.to,change.row.channel,change.row.channel_revision);
      setChange(null);setNoticeError(false); setNotice(t(result.changed?'pe474.channels.changed':'pe474.channels.unchanged'));
      await invalidatePsViews(cache);
    } catch (err) {
      const key = adminDeviceErrorKey(err), label = t(key);
      setChange(null);setNoticeError(true); setNotice(key==='adminDevice.error.channel_changed'?t('pe474.channels.concurrent'):label===key?t('genericError'):label);
      await page.query.refetch().catch(() => {});
    } finally { setBusy(false); }
  }
  return <div className="page-stack staff-page" data-testid="channels-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('pe474.channels.title')}</h1><p>{t('pe474.channels.lead')}</p></div><div className="heading-accent" aria-hidden="true"><RadioTower size={30}/></div></div>
    <PrintServersTabs/>
    <section className="servers-panel" aria-labelledby="pe474-channels-list">
      <div className="section-heading"><div><h2 id="pe474-channels-list">{t('pe474.channels.list')}</h2><p className="owner-section-lead">{t('pe474.channels.groupRule')}</p></div><button className="button button-secondary" type="button" disabled={page.query.isFetching} onClick={() => void page.query.refetch()}><RefreshCw size={15}/>{t('refresh')}</button></div>
      <div className="admin-list-toolbar"><AdminListFilters id="channels" filters={page.filters} set={page.set} clear={() => {page.clear();setVenue(null);}} statuses={['active','pending','revoked','online','offline','all'].map(value => ({value,label:t(`pe474.channels.status.${value}`)}))} afterStatus={<><label><span>{t('ota.ring')}</span><select data-testid="channels-ring" value={page.filters.channel??''} onChange={e => page.set('channel',e.target.value)}><option value="">{t('list.allStates')}</option>{RINGS.map(r => <option key={r} value={r}>{ringName(r)}</option>)}</select></label><label><span>{t('inv.venue')}</span><VenueCombobox value={venue} onChange={selected=>{setVenue(selected);page.set('venue_id',selected?.id??'');}} testId="channels-venue"/></label></>}/><span className="directory-count">{page.pagination.total}</span></div>
      {groupId&&<p className="fw-notice">{t('pe474.channels.groupFilter')} <Link to="/admin/print-servers/channels">{t('pe474.channels.clearGroup')}</Link></p>}
      {!page.query.isError&&page.query.data?.counts&&<div className="ota-badges" role="status" data-testid="channels-counts">{RINGS.map(r => <span key={r}>{ringName(r)}: {page.query.data?.counts?.[r] ?? 0}</span>)}</div>}
      {notice&&<div role={noticeError?'alert':'status'} className={`ps-result ${noticeError?'ps-result-error':'ps-result-ok'}`}>{noticeError?<AlertTriangle size={16}/>:<Check size={16}/>}<span>{notice}</span></div>}
      {page.query.isError ? <div role="alert" className="form-error">{t(psErrorKey(page.query.error))}<button className="button button-secondary" onClick={() => void page.query.refetch()}>{t('refresh')}</button></div> : page.query.isPending ? <p role="status" className="inline-empty">{t('dev.loading')}</p> : rows.length===0 ? <p className="inline-empty">{t('list.noMatches')}</p> : <div className="table-scroll"><table className="servers-table fw-table pe474-channels-table"><thead><tr><th>{t('dev.serial')}</th><th>{t('ps.hostname')}</th><th>{t('inv.venue')}</th><th>{t('ota.ring')}</th><th>{t('state')}</th><th>{t('ota.installed')}</th><th><span className="sr-only">{t('staff.actions')}</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.print_server_id} data-testid={`channel-row-${row.print_server_id}`}>
        <td data-label={t('dev.serial')} className="ps-mono">{row.serial??t('notProvided')}</td><td data-label={t('ps.hostname')}>{row.name??row.hostname??t('notProvided')}</td><td data-label={t('inv.venue')}>{row.venue_name??t('inv.unassigned')}</td><td data-label={t('ota.ring')}><span className={`server-status ota-ring-${row.channel}`}>{ringName(row.channel)}</span></td><td data-label={t('state')}><span className={`server-status ${row.online?'server-online':'server-offline'}`}>{t(`ps.state.${row.online?'online':'offline'}`)}</span> · {t(`pe474.channels.status.${row.status}`)===`pe474.channels.status.${row.status}`?row.status:t(`pe474.channels.status.${row.status}`)}</td><td data-label={t('ota.installed')}>{row.installed_version??t('notProvided')}</td><td data-label={t('staff.actions')}><div className="staff-actions">{row.href&&<Link className="button button-secondary" to={row.href}>{t('pe474.channels.openDevice')}</Link>}<label className="pe474-channel-select"><span className="sr-only">{t('pe474.channels.change')}</span><select value={row.channel} disabled={busy||page.query.isFetching||page.query.isError||row.update_in_progress||row.status!=='active'} aria-label={`${t('pe474.channels.change')}: ${row.serial??row.name??row.print_server_id}`} onChange={e => openChange(row,e.target.value as Ring)}>{RINGS.map(r => <option key={r} value={r}>{ringName(r)}</option>)}</select></label></div></td>
      </tr>)}</tbody></table></div>}
      <PrintListPagination id="channels" pagination={page.pagination} disabled={page.query.isFetching}/>
    </section>
    {change&&<PortalDialog title={t('pe474.channels.change')} titleId="channel-confirm-title" descriptionId="channel-confirm-description" alert dismissible={!busy} onClose={() => setChange(null)} actions={<><button className="button button-secondary" disabled={busy} onClick={() => setChange(null)}>{t('staff.cancel')}</button><button className="button button-primary" disabled={busy||page.query.isFetching||page.query.isError} onClick={() => void confirm()}>{t('staff.confirm')}</button></>}><p id="channel-confirm-description">{t('pe474.channels.confirm').replace('{serial}',change.row.serial??change.row.name??change.row.print_server_id).replace('{from}',ringName(change.row.channel)).replace('{to}',ringName(change.to))}</p><p className="ps-dialog-warning"><AlertTriangle size={16}/>{t('pe474.channels.noInstall')}</p></PortalDialog>}
  </div>;
}
