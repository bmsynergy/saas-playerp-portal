import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocale } from '../locales';
import type { MaintenanceNight } from '../lib/maintenance';

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

export function MaintenanceNights({ nights, venueId }: { nights: MaintenanceNight[]; venueId: string }) {
  const { locale, t } = useLocale();
  const [expanded, setExpanded] = useState<string[]>([]);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
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
  const formatResolved = (value: number | null) => value == null ? t('maintenance.unavailable') : value.toLocaleString(dateLocale);
  const status = (value: string) => t(`maintenance.status.${value}`);
  if (!nights.length) return <p className="maintenance-muted maintenance-empty-nights">{t('maintenance.noNights')}</p>;
  return <div className="maintenance-nights">{nights.map(night => {
    const key = `${venueId}-${night.local_date}`;
    const open = expanded.includes(key);
    return <article className={`maintenance-night ${night.problem ? 'maintenance-night-problem' : ''}`} key={key}>
      <button className="maintenance-night-toggle" type="button" aria-expanded={open} aria-controls={`maintenance-night-detail-${key}`} onClick={() => setExpanded(current => open ? current.filter(item => item !== key) : [...current, key])}>
        <span className="maintenance-night-main"><strong>{formatDate(night.local_date)}</strong><span className={`maintenance-status maintenance-status-${night.problem || night.status}`}>{status(night.problem || night.status)}</span></span>
        <span className="maintenance-night-facts"><span>{t('maintenance.executions')}: {night.attempts}</span><span>{t('maintenance.resolved')}: {formatResolved(night.resolved)}</span><span>{t('maintenance.duration')}: {formatDuration(night.duration_ms)}</span></span><ChevronDown className={open ? 'maintenance-chevron-open' : ''} size={18} aria-hidden="true"/>
      </button>
      {open && <div className="maintenance-night-body" id={`maintenance-night-detail-${key}`}>
        {errorText(night.error) && <p className="maintenance-error">{errorText(night.error)}</p>}
        {night.executions.length ? <ol className="maintenance-executions">{night.executions.map(execution => <li key={`${execution.attempt}-${execution.ran_at ?? ''}`} className="maintenance-execution">
          <div className="maintenance-execution-head"><div><h4>{t('maintenance.attempt')} {execution.attempt}{execution.current && <span className="maintenance-current">{t('maintenance.current')}</span>}</h4><span>{formatTime(execution.ran_at)}</span></div><span className={`maintenance-status maintenance-status-${execution.status}`}>{status(execution.status)}</span></div>
          <dl className="maintenance-facts"><div><dt>{t('maintenance.duration')}</dt><dd>{formatDuration(execution.duration_ms)}</dd></div><div><dt>{t('maintenance.resolved')}</dt><dd>{formatResolved(execution.resolved)}</dd></div></dl>
          {errorText(execution.error) && <p className="maintenance-error">{errorText(execution.error)}</p>}
          <div className="maintenance-task-list"><h5>{t('maintenance.tasks')}</h5>{execution.tasks.length ? <ul>{execution.tasks.map(task => <li key={task.key} className="maintenance-task"><div className="maintenance-task-head"><strong>{task.key}</strong><span className={`maintenance-status maintenance-status-${task.status}`}>{status(task.status)}</span></div><dl className="maintenance-facts"><div><dt>{t('maintenance.duration')}</dt><dd>{formatDuration(task.duration_ms)}</dd></div><div><dt>{t('maintenance.resolved')}</dt><dd>{formatResolved(task.resolved)}</dd></div></dl>{errorText(task.error) && <p className="maintenance-error">{errorText(task.error)}</p>}</li>)}</ul> : <p className="maintenance-muted">{t('maintenance.noTasks')}</p>}</div>
        </li>)}</ol> : <p className="maintenance-muted">{t('maintenance.noExecutions')}</p>}
      </div>}
    </article>;
  })}</div>;
}
