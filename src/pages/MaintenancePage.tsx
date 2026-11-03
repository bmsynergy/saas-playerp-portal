import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Bell, Clock3, RefreshCw, Search } from 'lucide-react';
import { useLocale } from '../locales';
import { errorCode } from '../lib/errors';
import { maintenanceFailureSummary } from '../lib/maintenanceMessages';
import { searchMaintenanceRecipients, type MaintenanceCandidate, type MaintenanceVenueList, type MaintenanceRecipients } from '../lib/maintenance';
import { PrintListPagination } from '../components/PrintListPagination';
import { PortalDialog } from '../components/PortalDialog';
import '../maintenance.css';

type Props = {
  data: MaintenanceVenueList;
  query: string;
  onQueryChange: (query: string) => void;
  onPageChange: (page: number) => void;
  loading: boolean;
  overviewError: string | null;
  recipients: MaintenanceRecipients | null;
  recipientsLoading: boolean;
  recipientsError: string | null;
  busy: boolean;
  mutationError: string | null;
  days: number;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
  onRecipientsRetry: () => void;
  onSetRecipient: (userId: string, enabled: boolean) => Promise<void>;
};

export function MaintenancePage({ data, query, onQueryChange, onPageChange, loading, overviewError, recipients, recipientsLoading, recipientsError, busy, mutationError, days, onDaysChange, onRefresh, onRecipientsRetry, onSetRecipient }: Props) {
  const { locale, t } = useLocale();
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [candidateResults, setCandidateResults] = useState<MaintenanceCandidate[]>([]);
  const [candidateActive, setCandidateActive] = useState(0);
  const [candidateMore, setCandidateMore] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState('');
  const [recipientActionError, setRecipientActionError] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<MaintenanceCandidate | null>(null);
  const [searchVersion, setSearchVersion] = useState(0);
  const recipientSearchRef = useRef<HTMLInputElement>(null);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
  const pagination = { page: data.page, pageCount: data.pages, pageSize: data.page_size, start: (data.page - 1) * data.page_size, end: Math.min(data.page * data.page_size, data.total), total: data.total, setPage: onPageChange, setPageSize: () => {} };
  useEffect(() => {
    if (!recipientDialogOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCandidateLoading(true); setCandidateError('');
      void searchMaintenanceRecipients(recipientQuery, controller.signal)
        .then(result => { if (!controller.signal.aborted) { setCandidateResults(result.candidates); setCandidateMore(result.candidates_has_more); setCandidateActive(0); } })
        .catch(error => { if (!controller.signal.aborted) setCandidateError(t(errorCode(error))); })
        .finally(() => { if (!controller.signal.aborted) setCandidateLoading(false); });
    }, recipientQuery ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [recipientDialogOpen, recipientQuery, searchVersion, t]);
  const changeRecipient = async (userId: string, enabled: boolean) => {
    setRecipientActionError('');
    try {
      await onSetRecipient(userId, enabled);
      if (enabled) { setSelectedCandidate(null); setRecipientQuery(''); recipientSearchRef.current?.focus(); }
      setSearchVersion(current => current + 1);
    } catch (error) { setRecipientActionError(t(errorCode(error))); }
  };
  const effectiveCount = recipients?.effective_count ?? 0;
  const formatDate = (value: string | null) => {
    if (!value) return t('maintenance.unavailable');
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
  };

  return <div className="page-stack maintenance-page" data-testid="maintenance-page">
    <header className="page-heading maintenance-heading">
      <div><p className="eyebrow">{t('maintenance.eyebrow')}</p><h1>{t('maintenance.nav')}</h1><p>{t('maintenance.lead')}</p></div>
      <div className="maintenance-heading-actions"><button className="button button-secondary" type="button" onClick={() => { setCandidateLoading(true); setRecipientDialogOpen(true); }} data-testid="maintenance-recipients-open"><Bell size={16} aria-hidden="true"/>{t('maintenance.recipientsButton').replace('{count}', String(recipients?.recipients.length ?? data.summary.alert_recipients ?? 0))}</button><button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCw size={16} aria-hidden="true"/>{t('maintenance.refresh')}</button></div>
    </header>

    <div className="maintenance-summary" aria-label={t('maintenance.summary')}><div><span>{t('maintenance.summaryVenues')}</span><strong>{data.summary.venues}</strong></div><div><span>{t('maintenance.summaryProblemVenues')}</span><strong>{data.summary.venues_with_problems}</strong></div><div><span>{t('maintenance.summaryLastNightProblemVenues')}</span><strong>{data.summary.venues_last_night_problem}</strong></div><div><span>{t('maintenance.summaryProblemNights')}</span><strong>{data.summary.problem_nights}</strong></div></div>
    {overviewError && <div className="maintenance-inline-error" role="alert"><span>{overviewError}</span><button className="button button-secondary" type="button" onClick={onRefresh}>{t('maintenance.retry')}</button></div>}
    <section className="maintenance-panel" aria-labelledby="maintenance-venues-title">
      <div className="maintenance-section-head"><div><p className="eyebrow">{t('maintenance.historyEyebrow')}</p><h2 id="maintenance-venues-title">{t('maintenance.venueList')}</h2><p>{t('maintenance.venueListLead')}</p></div></div>
      <div className="maintenance-filters">
        <label><span>{t('maintenance.days')}</span><select value={days} onChange={event => onDaysChange(Number(event.target.value))}>{[7, 14, 30, 90].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="maintenance-query"><span>{t('maintenance.searchVenue')}</span><input type="search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder={t('maintenance.searchVenuePlaceholder')} data-testid="maintenance-venue-search"/></label>
      </div>
      <PrintListPagination pagination={pagination} id="maintenance" disabled={loading} fixedSize />
      {loading && <p className="maintenance-muted" role="status">{t('maintenance.loadingVenues')}</p>}
      <div aria-busy={loading}>{!loading && !overviewError && data.venues.length ? <div className="maintenance-venue-list">{data.venues.map(venue => <Link className={`maintenance-venue-row ${venue.problem_nights > 0 ? 'maintenance-venue-row-problem' : ''}`} to={`/admin/tenants/${encodeURIComponent(venue.venue_id)}/maintenance`} key={venue.venue_id} data-testid="maintenance-venue-row">
        <span className="maintenance-venue-identity"><strong>{venue.venue_name || venue.venue_id}</strong><small>{venue.timezone}</small></span>
        <span className="maintenance-venue-metric"><small>{t('maintenance.latestNight')}</small>{venue.last_night ? <><span><span className={`maintenance-status maintenance-status-${venue.last_night.problem || venue.last_night.status}`}>{t(`maintenance.status.${venue.last_night.problem || venue.last_night.status}`)}</span><small>{formatDate(venue.last_night.local_date)}</small></span>{maintenanceFailureSummary(venue.last_night.failed_tasks, venue.last_night.tasks_total, locale) && <span className="maintenance-failure-summary">{maintenanceFailureSummary(venue.last_night.failed_tasks, venue.last_night.tasks_total, locale)}</span>}</> : <span>{t('maintenance.noNights')}</span>}</span>
        <span className="maintenance-venue-metric"><small>{t('maintenance.problemNightsInPeriod')}</small><strong className={venue.problem_nights > 0 ? 'maintenance-danger-text' : ''}>{venue.problem_nights}</strong></span>
        <span className="maintenance-venue-metric"><small>{t('maintenance.lastSuccess')}</small><span>{formatDate(venue.last_success_date)}</span></span>
        <span className="maintenance-row-action" aria-hidden="true">{t('maintenance.openVenue')} →</span>
      </Link>)}</div> : !loading && !overviewError && <p className="maintenance-muted maintenance-empty-nights">{query ? t('maintenance.noMatchingVenues') : t('maintenance.noVenues')}</p>}</div>
    </section>

    {recipientDialogOpen && <PortalDialog title={t('maintenance.recipients')} titleId="maintenance-recipients-title" testId="maintenance-recipients-dialog" onClose={() => setRecipientDialogOpen(false)} actions={<button className="button button-secondary" type="button" onClick={() => setRecipientDialogOpen(false)}>{t('maintenance.close')}</button>}>
      <p className="maintenance-muted">{t('maintenance.recipientsLead')}</p>
      {recipientsLoading && <p className="maintenance-muted" role="status"><Clock3 size={16} aria-hidden="true"/>{t('maintenance.loadingRecipients')}</p>}
      {recipientsError && <div className="maintenance-inline-error" role="alert"><span>{recipientsError}</span><button className="button button-secondary" type="button" onClick={onRecipientsRetry}>{t('maintenance.retry')}</button></div>}
      {(mutationError || recipientActionError) && <p className="maintenance-inline-error" role="alert">{recipientActionError || mutationError}</p>}
      {recipients && <>
        {effectiveCount === 0 && <p className="maintenance-empty-alert"><AlertCircle size={18} aria-hidden="true"/>{t('maintenance.noEmail')}</p>}
        {recipients.recipients.length ? <ul className="maintenance-recipient-list">{recipients.recipients.map(person => <li key={person.user_id}><div><strong>{person.name || person.email}</strong><span>{person.email}{!person.effective && ` · ${t('maintenance.inactiveRecipient')}`}</span></div><button className="button button-secondary" type="button" disabled={busy} onClick={() => void changeRecipient(person.user_id, false)} aria-label={`${t('maintenance.remove')} ${person.email}`}>{t('maintenance.remove')}</button></li>)}</ul> : <p className="maintenance-muted">{t('maintenance.noRecipients')}</p>}
      </>}
      <div className="maintenance-add"><label htmlFor="maintenance-candidate-search">{t('maintenance.addPerson')}</label><div className="maintenance-candidate-search"><Search size={16} aria-hidden="true"/><input ref={recipientSearchRef} id="maintenance-candidate-search" role="combobox" aria-autocomplete="list" aria-controls="maintenance-candidate-results" aria-activedescendant={!candidateLoading && candidateResults[candidateActive] ? `maintenance-candidate-${candidateResults[candidateActive].user_id}` : undefined} aria-expanded={!candidateLoading && candidateResults.length > 0} type="search" autoComplete="off" value={recipientQuery} onChange={event => { setRecipientQuery(event.target.value); setSelectedCandidate(null); setCandidateResults([]); setCandidateLoading(true); setCandidateActive(0); }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setCandidateActive(index => Math.min(index + 1, Math.max(0, candidateResults.length - 1))); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setCandidateActive(index => Math.max(0, index - 1)); }
        if (event.key === 'Enter' && candidateResults[candidateActive]) { event.preventDefault(); setSelectedCandidate(candidateResults[candidateActive]); }
        if (event.key === 'Escape') setSelectedCandidate(null);
      }} placeholder={t('maintenance.searchPeople')} disabled={busy} /></div>
        {candidateLoading && <p className="maintenance-muted" role="status">{t('maintenance.searchingPeople')}</p>}
        {candidateError && <p className="maintenance-inline-error" role="alert">{candidateError}</p>}
        {!candidateLoading && !candidateError && <><div id="maintenance-candidate-results" className="maintenance-candidate-list" role="listbox" aria-label={t('maintenance.searchResults')}>{candidateResults.map((person, index) => <button id={`maintenance-candidate-${person.user_id}`} key={person.user_id} type="button" role="option" aria-selected={selectedCandidate?.user_id === person.user_id} className={candidateActive === index ? 'active' : ''} onMouseEnter={() => setCandidateActive(index)} onClick={() => { setSelectedCandidate(person); setCandidateActive(index); }}><strong>{person.name || person.email}</strong><span>{person.email}</span></button>)}</div>{!candidateResults.length && <p className="maintenance-muted">{recipientQuery ? t('maintenance.noMatchingPeople') : t('maintenance.noCandidates')}</p>}{candidateMore && <p className="maintenance-muted">{t('maintenance.refineSearch')}</p>}</>}
        <button className="button button-primary" type="button" disabled={!selectedCandidate || busy} onClick={() => { if (selectedCandidate) void changeRecipient(selectedCandidate.user_id, true); }}>{t('maintenance.add')}</button>
      </div>
    </PortalDialog>}
  </div>;
}
