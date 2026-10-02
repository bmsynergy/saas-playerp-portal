import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { psErrorKey, type PanelPrinter, type PrinterJob, type PrinterJobsPage, type PrintServerApi } from '../lib/printServerApi';
import { useLocale } from '../locales';

export const QUEUE_PAGE_SIZE = 10;
type Props = { venueId: string; printer: Pick<PanelPrinter, 'id' | 'label' | 'is_active' | 'pending_jobs' | 'last_error' | 'last_report' | 'last_report_at'>; api: Pick<PrintServerApi, 'getPrinterJobs'>; reloadKey?: number };
const STATUS_CLASS: Record<string, string> = { sent: 'status-active', done: 'status-active', pending: 'ps-job-open', printing: 'ps-job-open', failed: 'ps-job-failed', expired: 'ps-job-failed' };
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [key, value]) => out.split(`{${key}}`).join(String(value)), text);

// Read-only queue of one printer: status, date, source, attempts and error, with
// pagination and a manual refresh. It only ever asks for its own venue and printer.
export function PrinterQueue({ venueId, printer, api, reloadKey = 0 }: Props) {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<PrinterJobsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const request = useRef(0);
  const dateFormatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'medium' });

  const load = useCallback(async (at: number) => {
    const id = ++request.current;
    setLoading(true); setErrorKey(null);
    try {
      const next = await api.getPrinterJobs(venueId, printer.id, QUEUE_PAGE_SIZE, at);
      if (id !== request.current) return;
      // The queue shrank under this page: step back to the last page that exists.
      const last = Math.max(0, (Math.ceil(next.total / QUEUE_PAGE_SIZE) - 1) * QUEUE_PAGE_SIZE);
      if (next.jobs.length === 0 && at > 0 && last !== at) { setOffset(last); return; }
      setPage(next);
    } catch (error) { if (id === request.current) setErrorKey(psErrorKey(error)); }
    finally { if (id === request.current) setLoading(false); }
  }, [api, venueId, printer.id]);
  // A newer request, or leaving the page, discards whatever is still in flight.
  useEffect(() => { void load(offset); return () => { request.current += 1; }; }, [load, offset, reloadKey]);

  function date(value: string | null) {
    const time = value ? new Date(value) : null;
    return time && !Number.isNaN(time.getTime()) ? dateFormatter.format(time) : t('notProvided');
  }
  // Known keys get their own text; an unknown code is shown as a code, never as server text.
  function label(prefix: string, slug: string, fallbackKey: string) {
    const key = `${prefix}.${slug}`; const text = t(key);
    return text === key ? fill(t(fallbackKey), { code: slug }) : text;
  }
  function errorText(job: PrinterJob) {
    const code = job.error_code ?? job.attempt_error_code;
    if (!code) return null;
    const printerCode = /^printer_(\d{3})$/.exec(code);
    return printerCode ? fill(t('ps.jobs.error.printerCode'), { code: printerCode[1] }) : label('ps.jobs.error', code, 'ps.jobs.error.unknown');
  }

  const total = page?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE));
  const current = Math.min(pages, Math.floor(offset / QUEUE_PAGE_SIZE) + 1);
  const shown = page?.jobs ?? [];
  const name = printer.label || t('notProvided');
  const notice = printer.last_error || printer.last_report?.error;
  const reportAt = printer.last_report?.reported_at ?? printer.last_report_at;

  return <div className="ps-queue" data-testid={`queue-${printer.id}`} data-loading={String(loading)}>
    <h3 className="ps-queue-heading"><button type="button" className="ps-queue-toggle" data-testid={`queue-toggle-${printer.id}`} aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(value => !value)}>
      <span className="ps-queue-summary">
        <span className="ps-queue-name">{name}</span>
        <span className={`status-badge ${printer.is_active ? 'status-active' : 'status-inactive'}`}><span className="badge-dot"/>{t(printer.is_active ? 'ps.printers.active' : 'ps.printers.paused')}</span>
        <span className="ps-queue-pending">{t('ps.pendingJobs')}: <strong>{printer.pending_jobs}</strong></span>
        <span className={`ps-queue-notice ${notice ? 'ps-error-text' : 'staff-self-note'}`}>{t('ps.jobs.lastNotice')}: {notice || t('ps.jobs.noNotice')}</span>
        <span className="ps-queue-report-date">{t('ps.printers.lastReport')}: {reportAt ? date(reportAt) : t('ps.never')}</span>
      </span>
      <ChevronDown className="ps-queue-chevron" size={19} aria-hidden="true"/>
    </button></h3>
    <div id={detailId} className="ps-queue-detail" hidden={!open} aria-busy={loading}>
    <div className="ps-queue-head">
      <span className="staff-self-note" data-testid={`queue-total-${printer.id}`}>{fill(t(total === 1 ? 'ps.jobs.totalOne' : 'ps.jobs.total'), { n: total })}</span>
      <button type="button" className="button button-secondary ps-queue-refresh" data-testid={`queue-refresh-${printer.id}`} aria-label={`${t('ps.jobs.refresh')}: ${name}`} disabled={loading} onClick={() => void load(offset)}>{loading ? <span className="spinner ps-spinner"/> : <RefreshCw size={15}/>}{t('ps.jobs.refresh')}</button>
    </div>
    {errorKey && <div className="form-error ps-scan-error" role="alert" data-testid={`queue-error-${printer.id}`}><AlertTriangle size={19}/><span>{t(errorKey)}</span></div>}
    {!page ? (!errorKey && <p className="staff-self-note" data-testid={`queue-loading-${printer.id}`}>{t('ps.jobs.loading')}</p>)
      : total === 0 ? <div className="staff-empty ps-queue-empty" data-testid={`queue-empty-${printer.id}`}><Inbox size={25}/><strong>{t('ps.jobs.empty')}</strong><span>{t('ps.jobs.emptyHint')}</span></div>
      : <>
        <div className="staff-table-wrap"><table className="staff-table ps-jobs-table"><thead><tr><th>{t('state')}</th><th>{t('ps.jobs.date')}</th><th>{t('ps.jobs.source')}</th><th>{t('ps.jobs.attempts')}</th><th>{t('ps.jobs.error')}</th></tr></thead><tbody>{shown.map(job => {
          const error = errorText(job);
          return <tr key={job.id} data-testid={`job-row-${job.id}`} data-status={job.status}>
            <td data-label={t('state')}><span className={`status-badge ps-job-status ${STATUS_CLASS[job.status] ?? 'status-inactive'}`}><span className="badge-dot"/>{label('ps.jobs.status', job.status, 'ps.jobs.status.unknown')}</span></td>
            <td data-label={t('ps.jobs.date')}><span>{date(job.created_at)}</span>{job.completed_at && <small className="ps-sub">{t('ps.jobs.finished')}: {date(job.completed_at)}</small>}</td>
            <td data-label={t('ps.jobs.source')}>{job.source_type ? label('ps.jobs.source', job.source_type, 'ps.jobs.source.unknown') : t('notProvided')}</td>
            <td data-label={t('ps.jobs.attempts')}><strong>{job.attempts}</strong></td>
            <td data-label={t('ps.jobs.error')}>{error ? <span className="ps-error-text">{error}</span> : <span className="staff-self-note">{t('ps.jobs.noError')}</span>}</td>
          </tr>;
        })}</tbody></table></div>
        <div className="ps-queue-pager">
          <button type="button" className="button button-secondary" data-testid={`queue-prev-${printer.id}`} disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - QUEUE_PAGE_SIZE))}><ChevronLeft size={15}/>{t('ps.jobs.prev')}</button>
          <span className="staff-self-note" data-testid={`queue-page-${printer.id}`}>{fill(t('ps.jobs.page'), { n: current, m: pages })}</span>
          <button type="button" className="button button-secondary" data-testid={`queue-next-${printer.id}`} disabled={loading || offset + QUEUE_PAGE_SIZE >= total} onClick={() => setOffset(offset + QUEUE_PAGE_SIZE)}>{t('ps.jobs.next')}<ChevronRight size={15}/></button>
        </div>
      </>}
    </div>
  </div>;
}
