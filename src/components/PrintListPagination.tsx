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

type Pagination = ReturnType<typeof usePrintListPagination>;

export function PrintListPagination({ pagination, id }: { pagination: Pagination; id: string }) {
  const { locale, t } = useLocale();
  const number = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US');
  const { page, pageCount, pageSize, start, end, total, setPage, setPageSize } = pagination;
  const range = t('ps.pagination.range')
    .replace('{start}', number.format(total ? start + 1 : 0))
    .replace('{end}', number.format(end))
    .replace('{total}', number.format(total));

  return <nav className="ps-pagination" aria-label={t('ps.pagination.label')} data-testid={`${id}-pagination`}>
    <span className="ps-pagination-range" data-testid={`${id}-pagination-range`}>{range}</span>
    <div className="ps-pagination-controls">
      <label htmlFor={`${id}-page-size`}>{t('ps.pagination.rows')}</label>
      <select id={`${id}-page-size`} value={pageSize} onChange={event => setPageSize(Number(event.target.value))} data-testid={`${id}-pagination-size`}>
        {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
      </select>
      <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} data-testid={`${id}-pagination-prev`}>{t('ps.pagination.previous')}</button>
      <span className="ps-pagination-page" aria-live="polite" data-testid={`${id}-pagination-page`}>{t('ps.pagination.page').replace('{page}', number.format(page)).replace('{pages}', number.format(pageCount))}</span>
      <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pageCount} data-testid={`${id}-pagination-next`}>{t('ps.pagination.next')}</button>
    </div>
  </nav>;
}
