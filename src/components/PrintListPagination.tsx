import { useEffect, useState } from 'react';
import { useLocale } from '../locales';
import './print-list-pagination.css';

const PAGE_SIZES = [10, 25, 50] as const;

export function usePrintListPagination(total: number) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;

  // A refreshed inventory may have fewer rows than the currently selected page.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return {
    page: currentPage,
    pageCount,
    pageSize,
    start,
    end: Math.min(start + pageSize, total),
    total,
    setPage,
    setPageSize: (size: number) => { setPageSize(size); setPage(1); },
    reset: () => setPage(1),
  };
}

type Pagination = {
  page: number;
  pageCount: number;
  pageSize: number;
  start: number;
  end: number;
  total: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
};

export function PrintListPagination({ pagination, id, disabled = false, fixedSize = false }: { pagination: Pagination; id: string; disabled?: boolean; fixedSize?: boolean }) {
  const { locale, t } = useLocale();
  const number = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US');
  const { page, pageCount, pageSize, start, end, total, setPage, setPageSize } = pagination;
  const [draft, setDraft] = useState(String(page));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(String(page)); setInvalid(false); }, [page, pageCount, pageSize]);
  const range = t('ps.pagination.range')
    .replace('{start}', number.format(total ? start + 1 : 0))
    .replace('{end}', number.format(end))
    .replace('{total}', number.format(total));
  const pageNumber = /^\d+$/.test(draft) ? Number(draft) : NaN;
  const validDraft = Number.isSafeInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount;
  const confirm = () => {
    if (!validDraft) { setInvalid(true); return; }
    setInvalid(false);
    setDraft(String(pageNumber));
    setPage(pageNumber);
  };
  const error = t('ps.pagination.invalid').replace('{pages}', number.format(pageCount));

  return <nav className="ps-pagination" aria-label={t('ps.pagination.label')} data-testid={`${id}-pagination`}>
    <span className="ps-pagination-range" data-testid={`${id}-pagination-range`}>{range}</span>
    <div className="ps-pagination-controls">
      {fixedSize ? <span className="ps-pagination-fixed-size">{t('ps.pagination.rows')}: {pageSize}</span> : <><label htmlFor={`${id}-page-size`}>{t('ps.pagination.rows')}</label>
        <select id={`${id}-page-size`} value={pageSize} onChange={event => setPageSize(Number(event.target.value))} disabled={disabled} data-testid={`${id}-pagination-size`}>
          {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
        </select></>}
      <button type="button" onClick={() => setPage(page - 1)} disabled={disabled || page <= 1} data-testid={`${id}-pagination-prev`}>{t('ps.pagination.previous')}</button>
      <div className="ps-pagination-jump" data-testid={`${id}-pagination-page`}>
        <label htmlFor={`${id}-pagination-input`}>{t('ps.pagination.pageInput')}</label>
        <input id={`${id}-pagination-input`} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={draft} disabled={disabled} aria-invalid={invalid} aria-describedby={`${id}-pagination-total${invalid ? ` ${id}-pagination-error` : ''}`} onChange={event => { setDraft(event.target.value); setInvalid(false); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); confirm(); } }} data-testid={`${id}-pagination-input`}/>
        <span id={`${id}-pagination-total`} className="ps-pagination-page" aria-live="polite">{t('ps.pagination.ofPages').replace('{pages}', number.format(pageCount))}</span>
        <button type="button" onClick={confirm} disabled={disabled} data-testid={`${id}-pagination-go`}>{t('ps.pagination.go')}</button>
      </div>
      <button type="button" onClick={() => setPage(page + 1)} disabled={disabled || page >= pageCount} data-testid={`${id}-pagination-next`}>{t('ps.pagination.next')}</button>
      {invalid && <span id={`${id}-pagination-error`} className="ps-pagination-error" role="alert">{error}</span>}
    </div>
  </nav>;
}
