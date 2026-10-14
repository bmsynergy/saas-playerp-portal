import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { searchAdminVenues, type AdminVenueOption, adminDeviceErrorKey } from '../lib/psAdminDevice';
import { useLocale } from '../locales';

type Props = { value: AdminVenueOption | null; onChange: (venue: AdminVenueOption | null) => void; disabled?: boolean; includeVenueId?: string | null; testId?: string };
export function VenueCombobox({ value, onChange, disabled, includeVenueId, testId }: Props) {
  const { t } = useLocale();
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminVenueOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const request = useRef(0);
  const options: (AdminVenueOption | null)[] = [null, ...items];
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[id="${id}-option-${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, items.length, id]);
  useEffect(() => {
    if (!open) { setPlacement(null); return; }
    const update = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const footer = rootRef.current?.closest('.ps-dialog')?.querySelector('.ps-dialog-actions')?.getBoundingClientRect();
      const bottomBoundary = Math.min(window.innerHeight - 8, footer?.top ?? window.innerHeight - 8);
      const below = bottomBoundary - anchor.bottom - 6;
      const above = anchor.top - 8;
      const upwards = below < 150 && above > below;
      const maxHeight = Math.max(80, Math.min(300, (upwards ? above : below) - 6));
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - anchor.width - 8));
      setPlacement({ top: upwards ? undefined : anchor.bottom + 6, bottom: upwards ? window.innerHeight - anchor.top + 6 : undefined, left, width: Math.min(anchor.width, window.innerWidth - 16), maxHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, items.length]);
  useEffect(() => {
    if (!open || disabled) return;
    const current = ++request.current;
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]); setActive(0);
    const timer = window.setTimeout(() => {
      void searchAdminVenues(query, includeVenueId ?? value?.id ?? undefined, controller.signal)
        .then(found => { if (request.current === current) setItems(found); })
        .catch(err => { if (request.current === current && !controller.signal.aborted) setError(t(adminDeviceErrorKey(err))); })
        .finally(() => { if (request.current === current) setLoading(false); });
    }, query ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query, includeVenueId, value?.id, disabled, t]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node) && !listRef.current?.contains(event.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function choose(venue: AdminVenueOption | null) {
    onChange(venue); setQuery(''); setOpen(false); setActive(0); inputRef.current?.focus();
  }
  return <div ref={rootRef} className="venue-combobox">
    <div className="venue-combobox-control">
      <Search size={16} aria-hidden="true"/>
      <input ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open ? `${id}-option-${active}` : undefined} aria-label={t('inv.chooseVenue')} data-testid={testId} type="search" autoComplete="off" disabled={disabled} value={open ? query : value?.name ?? t('inv.unassigned')} placeholder={t('inv.searchVenues')} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }} onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive(i => Math.min(i + 1, options.length - 1)); }
        if (e.key === 'ArrowUp' && open) { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
        if (e.key === 'Enter' && open && options[active] !== undefined) { e.preventDefault(); choose(options[active]); }
        if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(''); }
        if (e.key === 'Tab' && open) { setOpen(false); setQuery(''); }
      }}/>
      <button type="button" tabIndex={-1} disabled={disabled} aria-label={t('inv.chooseVenue')} onClick={() => { setOpen(v => !v); inputRef.current?.focus(); }}><ChevronDown size={16}/></button>
    </div>
    {open && placement && createPortal(<div ref={listRef} className="venue-combobox-options" style={placement} id={`${id}-options`} role="listbox" aria-label={t('inv.chooseVenue')}>
      {options.map((venue, index) => <button type="button" tabIndex={-1} role="option" aria-selected={venue?.id === value?.id} id={`${id}-option-${index}`} key={venue?.id ?? 'none'} className={index === active ? 'active' : ''} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(venue)}>
        <strong>{venue?.name ?? t('inv.unassigned')}</strong>
        {venue && <small>{[venue.slug, venue.city, venue.state].filter(Boolean).join(' · ')}</small>}
        {venue?.assigned_device && <small>{t('inv.venueHasDevice').replace('{serial}', venue.assigned_device.serial)}</small>}
      </button>)}
      {loading && <p role="status">{t('dev.loading')}</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {!loading && !error && !items.length && query && <p>{t('inv.noVenues')}</p>}
    </div>, document.body)}
  </div>;
}
