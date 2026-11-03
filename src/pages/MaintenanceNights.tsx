import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocale } from '../locales';
import type { MaintenanceExecution, MaintenanceNight } from '../lib/maintenance';
import { MAINTENANCE_LABELS, maintenanceErrorMessage, maintenanceFailureSummary, maintenanceResolvedText, maintenanceTaskName } from '../lib/maintenanceMessages';

function failedTasks(execution: MaintenanceExecution): string[] {
  return execution.failed_tasks.length
    ? execution.failed_tasks
    : execution.tasks.filter(task => task.status !== 'ok').map(task => task.key);
}

function latestExecution(night: MaintenanceNight): MaintenanceExecution | undefined {
  return night.executions.find(execution => execution.current)
    ?? night.executions.reduce<MaintenanceExecution | undefined>((latest, execution) =>
      !latest || execution.attempt > latest.attempt ? execution : latest, undefined);
}

export function MaintenanceNights({ nights, venueId }: { nights: MaintenanceNight[]; venueId: string }) {
  const { locale, t } = useLocale();
  const [expanded, setExpanded] = useState<string[]>([]);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
  const labels = MAINTENANCE_LABELS[locale];
  const formatDate = (value: string) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  };
  const formatTime = (value: string | null) => {
    if (!value) return t('maintenance.unavailable');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };
  const formatDuration = (ms: number | null) => ms == null ? t('maintenance.unavailable') : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString(dateLocale, { maximumFractionDigits: 2 })} s`;
  const formatResolved = (value: number | null, failed: boolean) => {
    const translated = maintenanceResolvedText(value, failed, locale);
    return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(dateLocale) : translated ?? t('maintenance.unavailable');
  };
  const status = (value: string) => t(`maintenance.status.${value}`);
  const errorDetail = (value: unknown, summarized = false) => {
    const error = maintenanceErrorMessage(value, locale);
    if (!error) return null;
    return <div className="maintenance-error">{!summarized && <p>{error.message}</p>}<details className="maintenance-technical-detail"><summary>{labels.showTechnicalDetail}</summary><code>{error.technical}</code></details></div>;
  };

  if (!nights.length) return <p className="maintenance-muted maintenance-empty-nights">{t('maintenance.noNights')}</p>;
  return <div className="maintenance-nights">{nights.map(night => {
    const key = `${venueId}-${night.local_date}`;
    const open = expanded.includes(key);
    const current = latestExecution(night);
    const nightFailed = night.failed_tasks.length ? night.failed_tasks : current ? failedTasks(current) : [];
    const nightSummary = maintenanceFailureSummary(nightFailed, current?.tasks.length ?? nightFailed.length, locale);
    const nightIsFailed = night.status === 'error' || nightFailed.length > 0;
    return <article className={`maintenance-night ${night.problem ? 'maintenance-night-problem' : ''}`} key={key}>
      <button className="maintenance-night-toggle" type="button" aria-expanded={open} aria-controls={`maintenance-night-detail-${key}`} onClick={() => setExpanded(items => open ? items.filter(item => item !== key) : [...items, key])}>
        <span className="maintenance-night-main"><strong>{formatDate(night.local_date)}</strong><span className={`maintenance-status maintenance-status-${night.problem || night.status}`}>{status(night.problem || night.status)}</span>{nightSummary && <span className="maintenance-failure-summary">{nightSummary}</span>}</span>
        <span className="maintenance-night-facts"><span>{t('maintenance.executions')}: {night.attempts}</span><span>{t('maintenance.resolved')}: {formatResolved(night.resolved, nightIsFailed)}</span><span>{t('maintenance.duration')}: {formatDuration(night.duration_ms)}</span></span><ChevronDown className={open ? 'maintenance-chevron-open' : ''} size={18} aria-hidden="true"/>
      </button>
      {open && <div className="maintenance-night-body" id={`maintenance-night-detail-${key}`}>
        {errorDetail(night.error, Boolean(nightSummary))}
        {night.executions.length ? <ol className="maintenance-executions">{night.executions.map(execution => {
          const failed = failedTasks(execution);
          const summary = maintenanceFailureSummary(failed, execution.tasks.length, locale);
          return <li key={`${execution.attempt}-${execution.ran_at ?? ''}`} className="maintenance-execution">
            <div className="maintenance-execution-head"><div><h4>{t('maintenance.attempt')} {execution.attempt}{execution.current && <span className="maintenance-current">{t('maintenance.current')}</span>}</h4><span>{formatTime(execution.ran_at)}</span></div><span className={`maintenance-status maintenance-status-${execution.status}`}>{status(execution.status)}</span></div>
            {summary && <p className="maintenance-failure-summary">{summary}</p>}
            <dl className="maintenance-facts"><div><dt>{t('maintenance.duration')}</dt><dd>{formatDuration(execution.duration_ms)}</dd></div><div><dt>{t('maintenance.resolved')}</dt><dd>{formatResolved(execution.resolved, execution.status === 'error' || failed.length > 0)}</dd></div></dl>
            {errorDetail(execution.error, Boolean(summary))}
            <div className="maintenance-task-list"><h5>{t('maintenance.tasks')}</h5>{execution.tasks.length ? <ul>{execution.tasks.map(task => <li key={task.key} className="maintenance-task"><div className="maintenance-task-head"><span className="maintenance-task-name"><strong>{maintenanceTaskName(task.key, locale)}</strong><small>{task.key}</small></span><span className={`maintenance-status maintenance-status-${task.status}`}>{status(task.status)}</span></div><dl className="maintenance-facts"><div><dt>{t('maintenance.duration')}</dt><dd>{formatDuration(task.duration_ms)}</dd></div><div><dt>{t('maintenance.resolved')}</dt><dd>{formatResolved(task.resolved, task.status !== 'ok')}</dd></div></dl>{errorDetail(task.error)}</li>)}</ul> : <p className="maintenance-muted">{t('maintenance.noTasks')}</p>}</div>
          </li>;
        })}</ol> : <p className="maintenance-muted">{t('maintenance.noExecutions')}</p>}
      </div>}
    </article>;
  })}</div>;
}
