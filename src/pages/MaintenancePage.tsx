import { useMemo, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, ChevronDown, Clock3, RefreshCw } from 'lucide-react';
import { useLocale } from '../locales';
import type { MaintenanceOverview, MaintenanceRecipients } from '../lib/maintenance';
import '../maintenance.css';

type Props = {
  data: MaintenanceOverview;
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

export function MaintenancePage({ data, recipients, recipientsLoading, recipientsError, busy, mutationError, days, onDaysChange, onRefresh, onRecipientsRetry, onSetRecipient }: Props) {
  const { locale, t } = useLocale();
  const [venueId, setVenueId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
  const venues = useMemo(() => venueId ? data.venues.filter(venue => venue.venue_id === venueId) : data.venues, [data.venues, venueId]);
  const problems = useMemo(() => venueId ? data.problems.filter(problem => problem.venue_id === venueId) : data.problems, [data.problems, venueId]);
  const venueNames = useMemo(() => new Map(data.venues.map(venue => [venue.venue_id, venue.venue_name])), [data.venues]);
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
  const showNight = (venue: string, date: string) => {
    const key = keyFor(venue, date);
    setVenueId('');
    setExpanded(current => current.includes(key) ? current : [...current, key]);
    requestAnimationFrame(() => document.getElementById(`maintenance-night-${venue}-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const effectiveCount = recipients?.effective_count ?? 0;

  return <div className="page-stack maintenance-page" data-testid="maintenance-page">
    <header className="page-heading maintenance-heading">
      <div><p className="eyebrow">{t('maintenance.eyebrow')}</p><h1>{t('maintenance.nav')}</h1><p>{t('maintenance.lead')}</p></div>
      <button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCw size={16} aria-hidden="true"/>{t('maintenance.refresh')}</button>
    </header>

    <section className="maintenance-panel maintenance-problems" aria-labelledby="maintenance-problems-title">
      <div className="maintenance-section-head"><div><p className="eyebrow">{t('maintenance.priority')}</p><h2 id="maintenance-problems-title">{t('maintenance.problems')}</h2><p>{t('maintenance.problemsLead')}</p></div><span className={`maintenance-count ${problems.length ? 'maintenance-count-danger' : ''}`}>{problems.length}</span></div>
      {problems.length ? <ul className="maintenance-problem-list">{problems.map(problem => <li key={`${problem.venue_id}-${problem.local_date}`} className="maintenance-problem">
        <AlertCircle size={20} aria-hidden="true"/>
        <div><strong>{problem.venue_name || venueNames.get(problem.venue_id) || problem.venue_id}</strong><span>{formatDate(problem.local_date)} · {status(problem.kind)}</span>{errorText(problem.error) && <p className="maintenance-error">{errorText(problem.error)}</p>}{problem.failed_tasks.length > 0 && <p>{t('maintenance.failedTasks')}: {problem.failed_tasks.join(', ')}</p>}</div>
        <button className="button button-secondary" type="button" onClick={() => showNight(problem.venue_id, problem.local_date)}>{t('maintenance.viewNight')}</button>
      </li>)}</ul> : <div className="maintenance-ok"><CheckCircle2 size={20} aria-hidden="true"/><span>{t('maintenance.noProblems')}</span></div>}
    </section>

    <section className="maintenance-panel" aria-labelledby="maintenance-history-title">
      <div className="maintenance-section-head"><div><p className="eyebrow">{t('maintenance.historyEyebrow')}</p><h2 id="maintenance-history-title">{t('maintenance.history')}</h2><p>{t('maintenance.historyLead')}</p></div></div>
      <div className="maintenance-filters">
        <label><span>{t('maintenance.days')}</span><select value={days} onChange={event => onDaysChange(Number(event.target.value))}>{[7, 14, 30, 90].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>{t('maintenance.venue')}</span><select value={venueId} onChange={event => setVenueId(event.target.value)}><option value="">{t('maintenance.allVenues')}</option>{data.venues.map(venue => <option key={venue.venue_id} value={venue.venue_id}>{venue.venue_name}</option>)}</select></label>
      </div>
      {venues.length ? <div className="maintenance-venues">{venues.map(venue => <section className="maintenance-venue" key={venue.venue_id} aria-label={venue.venue_name}>
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
      </section>)}</div> : <p className="maintenance-muted maintenance-empty-nights">{t('maintenance.noVenues')}</p>}
    </section>

    <section className="maintenance-panel" aria-labelledby="maintenance-recipients-title">
      <div className="maintenance-section-head"><div><p className="eyebrow">{t('maintenance.alertEyebrow')}</p><h2 id="maintenance-recipients-title">{t('maintenance.recipients')}</h2><p>{t('maintenance.recipientsLead')}</p></div><Bell size={22} aria-hidden="true"/></div>
      {recipientsLoading && <p className="maintenance-muted" role="status"><Clock3 size={16} aria-hidden="true"/>{t('maintenance.loadingRecipients')}</p>}
      {recipientsError && <div className="maintenance-inline-error" role="alert"><span>{recipientsError}</span><button className="button button-secondary" type="button" onClick={onRecipientsRetry}>{t('maintenance.retry')}</button></div>}
      {mutationError && <p className="maintenance-inline-error" role="alert">{mutationError}</p>}
      {recipients && <>
        {effectiveCount === 0 && <p className="maintenance-empty-alert"><AlertCircle size={18} aria-hidden="true"/>{t('maintenance.noEmail')}</p>}
        {recipients.recipients.length ? <ul className="maintenance-recipient-list">{recipients.recipients.map(person => <li key={person.user_id}><div><strong>{person.name || person.email}</strong><span>{person.email}{!person.effective && ` · ${t('maintenance.inactiveRecipient')}`}</span></div><button className="button button-secondary" type="button" disabled={busy} onClick={() => void onSetRecipient(person.user_id, false)} aria-label={`${t('maintenance.remove')} ${person.email}`}>{t('maintenance.remove')}</button></li>)}</ul> : <p className="maintenance-muted">{t('maintenance.noRecipients')}</p>}
        <div className="maintenance-add"><label htmlFor="maintenance-candidate">{t('maintenance.addPerson')}</label><div><select id="maintenance-candidate" value={candidateId} disabled={busy || !recipients.candidates.length} onChange={event => setCandidateId(event.target.value)}><option value="">{t('maintenance.choosePerson')}</option>{recipients.candidates.map(person => <option key={person.user_id} value={person.user_id}>{person.name ? `${person.name} · ` : ''}{person.email}</option>)}</select><button className="button button-primary" type="button" disabled={!candidateId || busy} onClick={() => { const selected = candidateId; setCandidateId(''); void onSetRecipient(selected, true); }}>{t('maintenance.add')}</button></div>{!recipients.candidates.length && <p className="maintenance-muted">{t('maintenance.noCandidates')}</p>}</div>
      </>}
    </section>
  </div>;
}
