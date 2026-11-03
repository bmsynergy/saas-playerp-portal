import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, ChevronDown, Clock3, RefreshCw, Search } from 'lucide-react';
import { useLocale } from '../locales';
import { errorCode } from '../lib/errors';
import { searchMaintenanceRecipients, searchMaintenanceVenues, type MaintenanceCandidate, type MaintenanceOverview, type MaintenanceRecipients } from '../lib/maintenance';
import type { AdminVenueOption } from '../lib/psAdminDevice';
import { VenueCombobox } from '../components/VenueCombobox';
import { PrintListPagination } from '../components/PrintListPagination';
import { PortalDialog } from '../components/PortalDialog';
import '../maintenance.css';

type Props = {
  data: MaintenanceOverview;
  venue: AdminVenueOption | null;
  onVenueChange: (venue: AdminVenueOption | null) => void;
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

type Night = MaintenanceOverview['venues'][number]['nights'][number];
type Execution = Night['executions'][number];
type Task = Execution['tasks'][number];

function errorText(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail']) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function MaintenancePage({ data, venue, onVenueChange, onPageChange, loading, overviewError, recipients, recipientsLoading, recipientsError, busy, mutationError, days, onDaysChange, onRefresh, onRecipientsRetry, onSetRecipient }: Props) {
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
  const [pendingNight, setPendingNight] = useState<{ venueId: string; date: string } | null>(null);
  const recipientSearchRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
  const venues = data.venues;
  const problems = data.problems;
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
  useEffect(() => {
    if (!pendingNight || loading) return;
    const found = data.venues.some(item => item.venue_id === pendingNight.venueId && item.nights.some(night => night.local_date === pendingNight.date));
    if (!found) return;
    const key = `${pendingNight.venueId}:${pendingNight.date}`;
    setExpanded(current => current.includes(key) ? current : [...current, key]);
    requestAnimationFrame(() => document.getElementById(`maintenance-night-${pendingNight.venueId}-${pendingNight.date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    setPendingNight(null);
  }, [data.venues, loading, pendingNight]);
  const formatDate = (value: string) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
  };
  const formatTime = (value: string | null) => {
    if (!value) return t('maintenance.unavailable');
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  };
  const formatDuration = (ms: number | null) => ms == null ? t('maintenance.unavailable') : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString(dateLocale, { maximumFractionDigits: 2 })} s`;
  const formatResolved = (value: number | null) => value == null ? t('maintenance.unavailable') : value.toLocaleString(dateLocale);
  const status = (value: string) => t(`maintenance.status.${value}`);
  const keyFor = (venue: string, date: string) => `${venue}:${date}`;
  const isExpanded = (key: string) => expanded.includes(key);
  const toggle = (key: string) => setExpanded(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  const showNight = (problem: MaintenanceOverview['problems'][number]) => {
    setPendingNight({ venueId: problem.venue_id, date: problem.local_date });
    onVenueChange({ id: problem.venue_id, name: problem.venue_name, slug: null, city: null, state: null, is_active: true, assigned_device: null });
  };
  const changeRecipient = async (userId: string, enabled: boolean) => {
    setRecipientActionError('');
    try {
      await onSetRecipient(userId, enabled);
      if (enabled) { setSelectedCandidate(null); setRecipientQuery(''); recipientSearchRef.current?.focus(); }
      setSearchVersion(current => current + 1);
    } catch (error) { setRecipientActionError(t(errorCode(error))); }
  };
  const effectiveCount = recipients?.effective_count ?? 0;

  return <div className="page-stack maintenance-page" data-testid="maintenance-page">
    <header className="page-heading maintenance-heading">
      <div><p className="eyebrow">{t('maintenance.eyebrow')}</p><h1>{t('maintenance.nav')}</h1><p>{t('maintenance.lead')}</p></div>
      <div className="maintenance-heading-actions"><button className="button button-secondary" type="button" onClick={() => { setCandidateLoading(true); setRecipientDialogOpen(true); }} data-testid="maintenance-recipients-open"><Bell size={16} aria-hidden="true"/>{t('maintenance.recipientsButton').replace('{count}', String(recipients?.recipients.length ?? data.summary.alert_recipients ?? 0))}</button><button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCw size={16} aria-hidden="true"/>{t('maintenance.refresh')}</button></div>
    </header>

    <div className="maintenance-summary" aria-label={t('maintenance.summary')}><div><span>{t('maintenance.summaryVenues')}</span><strong>{data.summary.venues}</strong></div><div><span>{t('maintenance.summaryProblemVenues')}</span><strong>{data.summary.venues_with_problems}</strong></div><div><span>{t('maintenance.summaryProblemNights')}</span><strong>{data.summary.problem_nights}</strong></div></div>
    {overviewError && <div className="maintenance-inline-error" role="alert"><span>{overviewError}</span><button className="button button-secondary" type="button" onClick={onRefresh}>{t('maintenance.retry')}</button></div>}
    <section className="maintenance-panel maintenance-problems" aria-labelledby="maintenance-problems-title">
      <div className="maintenance-section-head"><div><p className="eyebrow">{t('maintenance.priority')}</p><h2 id="maintenance-problems-title">{t('maintenance.problems')}</h2><p>{t('maintenance.problemsLead')}</p></div><span className={`maintenance-count ${data.problems_total ? 'maintenance-count-danger' : ''}`}>{data.problems_total}</span></div>
      {problems.length ? <ul className="maintenance-problem-list">{problems.map(problem => <li key={`${problem.venue_id}-${problem.local_date}`} className="maintenance-problem">
        <AlertCircle size={20} aria-hidden="true"/>
        <div><strong>{problem.venue_name || problem.venue_id}</strong><span>{formatDate(problem.local_date)} · {status(problem.kind)}</span>{errorText(problem.error) && <p className="maintenance-error">{errorText(problem.error)}</p>}{problem.failed_tasks.length > 0 && <p>{t('maintenance.failedTasks')}: {problem.failed_tasks.join(', ')}</p>}</div>
        <button className="button button-secondary" type="button" onClick={() => showNight(problem)}>{t('maintenance.viewNight')}</button>
      </li>)}</ul> : <div className="maintenance-ok"><CheckCircle2 size={20} aria-hidden="true"/><span>{t('maintenance.noProblems')}</span></div>}
      {data.problems_total > problems.length && <p className="maintenance-problems-more">{t('maintenance.problemsShown').replace('{shown}', String(problems.length)).replace('{total}', String(data.problems_total))}</p>}
    </section>

    <section className="maintenance-panel" aria-labelledby="maintenance-history-title">
      <div className="maintenance-section-head"><div><p className="eyebrow">{t('maintenance.historyEyebrow')}</p><h2 id="maintenance-history-title">{t('maintenance.history')}</h2><p>{t('maintenance.historyLead')}</p></div></div>
      <div className="maintenance-filters">
        <label><span>{t('maintenance.days')}</span><select value={days} onChange={event => onDaysChange(Number(event.target.value))}>{[7, 14, 30, 90].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <div className="maintenance-venue-filter"><span>{t('maintenance.venue')}</span><VenueCombobox value={venue} onChange={onVenueChange} search={searchMaintenanceVenues} emptyLabel={t('maintenance.allVenues')} testId="maintenance-venue-search"/></div>
      </div>
      <PrintListPagination pagination={pagination} id="maintenance" disabled={loading} fixedSize />
      {loading && <p className="maintenance-muted" role="status">{t('maintenance.loadingHistory')}</p>}
      <div aria-busy={loading}>{!loading && venues.length ? <div className="maintenance-venues">{venues.map(venue => <section className="maintenance-venue" key={venue.venue_id} aria-label={venue.venue_name}>
        <div className="maintenance-venue-head"><div><h3>{venue.venue_name}</h3><p>{venue.timezone}</p></div><span className={`maintenance-count ${venue.problems ? 'maintenance-count-danger' : ''}`}>{venue.problems ? `${venue.problems} ${t('maintenance.problemCount')}` : t('maintenance.noProblemsShort')}</span></div>
        <div className="maintenance-nights">{venue.nights.length ? venue.nights.map((night: Night) => {
          const key = keyFor(venue.venue_id, night.local_date);
          const open = isExpanded(key);
          return <article className={`maintenance-night ${night.problem ? 'maintenance-night-problem' : ''}`} id={`maintenance-night-${venue.venue_id}-${night.local_date}`} key={night.local_date}>
            <button className="maintenance-night-toggle" type="button" aria-expanded={open} aria-controls={`maintenance-night-detail-${venue.venue_id}-${night.local_date}`} onClick={() => toggle(key)}>
              <span className="maintenance-night-main"><strong>{formatDate(night.local_date)}</strong><span className={`maintenance-status maintenance-status-${night.status}`}>{status(night.status)}</span></span>
              <span className="maintenance-night-facts"><span>{t('maintenance.executions')}: {night.attempts}</span><span>{t('maintenance.resolved')}: {formatResolved(night.resolved)}</span><span>{t('maintenance.duration')}: {formatDuration(night.duration_ms)}</span></span><ChevronDown className={open ? 'maintenance-chevron-open' : ''} size={18} aria-hidden="true"/>
            </button>
            {open && <div className="maintenance-night-body" id={`maintenance-night-detail-${venue.venue_id}-${night.local_date}`}>
              {errorText(night.error) && <p className="maintenance-error">{errorText(night.error)}</p>}
              {night.executions.length ? <ol className="maintenance-executions">{night.executions.map((execution: Execution) => <li key={`${execution.attempt}-${execution.ran_at ?? ''}`} className="maintenance-execution">
                <div className="maintenance-execution-head"><div><h4>{t('maintenance.attempt')} {execution.attempt}{execution.current && <span className="maintenance-current">{t('maintenance.current')}</span>}</h4><span>{formatTime(execution.ran_at)}</span></div><span className={`maintenance-status maintenance-status-${execution.status}`}>{status(execution.status)}</span></div>
                <dl className="maintenance-facts"><div><dt>{t('maintenance.duration')}</dt><dd>{formatDuration(execution.duration_ms)}</dd></div><div><dt>{t('maintenance.resolved')}</dt><dd>{formatResolved(execution.resolved)}</dd></div></dl>
                {errorText(execution.error) && <p className="maintenance-error">{errorText(execution.error)}</p>}
                <div className="maintenance-task-list"><h5>{t('maintenance.tasks')}</h5>{execution.tasks.length ? <ul>{execution.tasks.map((task: Task) => <li key={task.key} className="maintenance-task"><div className="maintenance-task-head"><strong>{task.key}</strong><span className={`maintenance-status maintenance-status-${task.status}`}>{status(task.status)}</span></div><dl className="maintenance-facts"><div><dt>{t('maintenance.duration')}</dt><dd>{formatDuration(task.duration_ms)}</dd></div><div><dt>{t('maintenance.resolved')}</dt><dd>{formatResolved(task.resolved)}</dd></div></dl>{errorText(task.error) && <p className="maintenance-error">{errorText(task.error)}</p>}</li>)}</ul> : <p className="maintenance-muted">{t('maintenance.noTasks')}</p>}</div>
              </li>)}</ol> : <p className="maintenance-muted">{t('maintenance.noExecutions')}</p>}
            </div>}
          </article>;
        }) : <p className="maintenance-muted maintenance-empty-nights">{t('maintenance.noNights')}</p>}</div>
      </section>)}</div> : !loading && <p className="maintenance-muted maintenance-empty-nights">{t('maintenance.noVenues')}</p>}</div>
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
