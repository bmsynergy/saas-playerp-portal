import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Clock3, Inbox, LockKeyhole, MessageCircle, RefreshCw, Search, Send, SlidersHorizontal, UserRound } from 'lucide-react';
import { useLocale } from '../locales';
import { supportText } from '../locales/support';
import { VenueCombobox } from '../components/VenueCombobox';
import { PrintListPagination } from '../components/PrintListPagination';
import type { AdminVenueOption } from '../lib/psAdminDevice';
import { defaultSupportFilters, type SupportDetail, type SupportFilters, type SupportList, type SupportPriority, type SupportScope, type SupportStaff, type SupportStatus, type SupportTicket } from '../lib/support';
import '../support.css';

type Copy = typeof supportText.es | typeof supportText.en;
type VenueOption = { id: string; name: string };
export type SupportPageProps = {
  scope: SupportScope;
  venueName?: string;
  venueOptions?: VenueOption[];
  venueSearch?: (query: string, includeVenueId?: string, signal?: AbortSignal) => Promise<AdminVenueOption[]>;
  filters: SupportFilters;
  onFiltersChange: (patch: Partial<SupportFilters>) => void;
  list?: SupportList;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onPageChange: (page: number) => void;
  selectedTicketId?: string | null;
  detail?: SupportDetail;
  detailLoading?: boolean;
  detailError?: string | null;
  onDetailRetry?: () => void;
  onCloseThread: () => void;
  onReply: (body: string, isInternal: boolean) => Promise<void>;
  onStatus: (status: SupportStatus) => Promise<void>;
  onAssign: (userId: string | null) => Promise<void>;
  onPriority: (priority: SupportPriority) => Promise<void>;
  assignableStaff?: SupportStaff[];
  staffError?: string | null;
  onStaffRetry?: () => void;
  mutationBusy?: boolean;
  mutationError?: string | null;
  mutationNotice?: string | null;
};

const statuses: SupportStatus[] = ['open', 'in_progress', 'waiting_tenant', 'resolved', 'closed'];
const priorities: SupportPriority[] = ['low', 'normal', 'high', 'urgent'];

function dateText(value: string | null | undefined, locale: string, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function Badge({ kind, text }: { kind: 'status' | 'priority' | 'attention'; text: string }) {
  return <span className={`support-badge support-badge-${kind}`}>{text}</span>;
}

function TicketRow({ ticket, scope, copy, locale, onOpen }: { ticket: SupportTicket; scope: SupportScope; copy: Copy; locale: string; onOpen: (id: string) => void }) {
  return <li className={`support-ticket${ticket.unread ? ' is-unread' : ''}`}>
    <button type="button" className="support-ticket-button" onClick={() => onOpen(ticket.id)} aria-label={`${copy.openTicket}: ${ticket.subject}`} data-testid={`support-ticket-${ticket.id}`}>
      <span className="support-ticket-icon" aria-hidden="true"><MessageCircle size={21}/></span>
      <span className="support-ticket-main"><span className="support-ticket-title">{ticket.subject}</span><span className="support-ticket-meta"><span>{ticket.venue_name || copy.unknown} · </span>{copy.creator}: {ticket.created_by_name || copy.unknown} · {copy.created}: {dateText(ticket.created_at, locale, copy.unknown)}</span><span className="support-ticket-badges"><Badge kind="status" text={copy[ticket.status]}/><Badge kind="priority" text={copy[ticket.priority]}/>{ticket.pending && <Badge kind="attention" text={copy.pending}/ >}{ticket.unread && <Badge kind="attention" text={copy.unread}/>}</span></span>
      <span className="support-ticket-trailing"><span><Clock3 size={14}/>{dateText(ticket.last_message_at || ticket.updated_at, locale, copy.unknown)}</span>{scope === 'platform' && <small><UserRound size={13}/>{ticket.assigned_name || copy.noAssignee}</small>}</span>
      <ArrowRight size={18} className="support-ticket-arrow" aria-hidden="true"/>
    </button>
  </li>;
}

export type SupportThreadProps = Pick<SupportPageProps, 'scope' | 'detail' | 'detailLoading' | 'detailError' | 'onDetailRetry' | 'onCloseThread' | 'onReply' | 'onStatus' | 'onAssign' | 'onPriority' | 'assignableStaff' | 'staffError' | 'onStaffRetry' | 'mutationBusy' | 'mutationError' | 'mutationNotice'>;

export function SupportThread({ scope, detail, detailLoading, detailError, onDetailRetry, onCloseThread, onReply, onStatus, onAssign, onPriority, assignableStaff = [], staffError, onStaffRetry, mutationBusy = false, mutationError, mutationNotice }: SupportThreadProps) {
  const { locale } = useLocale();
  const copy: Copy = supportText[locale];
  const [mode, setMode] = useState<'reply' | 'internal'>('reply');
  const [body, setBody] = useState('');
  const [localError, setLocalError] = useState('');
  useEffect(() => { setBody(''); setMode('reply'); setLocalError(''); }, [detail?.ticket.id]);
  async function send(event: FormEvent) {
    event.preventDefault();
    const message = body.trim();
    if (message.length < 2) { setLocalError(locale === 'es' ? 'Escribe al menos dos caracteres.' : 'Write at least two characters.'); return; }
    if (message.length > 5000) { setLocalError(locale === 'es' ? 'El mensaje supera 5000 caracteres.' : 'Message exceeds 5000 characters.'); return; }
    setLocalError('');
    try { await onReply(message, scope === 'platform' && mode === 'internal'); setBody(''); } catch { /* The parent displays the operation error. */ }
  }
  return <section className="support-thread" aria-label={copy.messages} data-testid="support-thread">
    <button className="support-back" type="button" onClick={onCloseThread} disabled={mutationBusy}><ArrowLeft size={17}/>{copy.back}</button>
    {detailLoading && !detail ? <div className="support-placeholder" role="status"><span className="spinner"/>{copy.loadingThread}</div> : detailError && !detail ? <div className="support-placeholder" role="alert"><strong>{copy.threadError}</strong><span>{detailError}</span>{onDetailRetry && <button type="button" className="button button-secondary" onClick={onDetailRetry}>{copy.retry}</button>}</div> : detail ? <>
      <header className="support-thread-head"><div><p className="eyebrow">{detail.ticket.venue_name}</p><h2>{detail.ticket.subject}</h2><p>{copy.creator}: {detail.ticket.created_by_name || copy.unknown} · {dateText(detail.ticket.created_at, locale, copy.unknown)}</p></div><div className="support-ticket-badges"><Badge kind="status" text={copy[detail.ticket.status]}/><Badge kind="priority" text={copy[detail.ticket.priority]}/></div></header>
      {(mutationError || mutationNotice) && <div className={`support-feedback ${mutationError ? 'is-error' : 'is-success'}`} role={mutationError ? 'alert' : 'status'}>{mutationError || mutationNotice}</div>}
      <div className="support-thread-controls"><label><span>{copy.updateStatus}</span><select aria-label={copy.updateStatus} value={detail.ticket.status} onChange={event => { void onStatus(event.target.value as SupportStatus).catch(() => {}); }} disabled={mutationBusy}>{!detail.ticket.allowed_statuses?.includes(detail.ticket.status) && <option value={detail.ticket.status} disabled>{copy[detail.ticket.status]}</option>}{(detail.ticket.allowed_statuses || []).map(status => <option key={status} value={status}>{copy[status]}</option>)}</select></label>{scope === 'platform' && <><label><span>{copy.updatePriority}</span><select aria-label={copy.updatePriority} value={detail.ticket.priority} onChange={event => { void onPriority(event.target.value as SupportPriority).catch(() => {}); }} disabled={mutationBusy}>{priorities.map(priority => <option key={priority} value={priority}>{copy[priority]}</option>)}</select></label><label><span>{copy.updateAssignee}</span><select aria-label={copy.updateAssignee} value={detail.ticket.assigned_to || ''} onChange={event => { void onAssign(event.target.value || null).catch(() => {}); }} disabled={mutationBusy || !!staffError}><option value="">{copy.noAssignee}</option>{assignableStaff.map(staff => <option key={staff.user_id} value={staff.user_id}>{staff.name || staff.email}</option>)}</select></label></> }</div>
      {scope === 'platform' && staffError && <div className="support-feedback is-error" role="alert">{copy.staffError} {staffError} {onStaffRetry && <button type="button" onClick={onStaffRetry}>{copy.retry}</button>}</div>}
      <ol className="support-messages" aria-label={copy.messages}>{detail.messages.length ? detail.messages.map(message => <li className={`support-message ${message.is_internal && scope === 'platform' ? 'is-internal' : ''}`} key={message.id}><div className="support-message-header"><strong>{message.is_internal && scope === 'platform' ? <><LockKeyhole size={15}/>{copy.privateNote}</> : message.author_name || (message.author_scope === 'platform' ? copy.fromSupport : copy.fromVenue)}</strong><time dateTime={message.created_at}>{dateText(message.created_at, locale, copy.unknown)}</time></div>{message.is_internal && scope === 'platform' && <span className="support-message-author">{message.author_name || copy.fromSupport}</span>}<p>{message.body}</p></li>) : <li className="support-message-empty">{copy.noMessages}</li>}</ol>
      {detail.ticket.can_reply !== false && <form className="support-compose" onSubmit={event => void send(event)}><div className="support-compose-tabs" role="group" aria-label={copy.messages}><button type="button" disabled={mutationBusy} className={mode === 'reply' ? 'active' : ''} onClick={() => { setMode('reply'); setLocalError(''); }} aria-pressed={mode === 'reply'}>{copy.reply}</button>{scope === 'platform' && <button type="button" disabled={mutationBusy} className={mode === 'internal' ? 'active internal' : ''} onClick={() => { setMode('internal'); setLocalError(''); }} aria-pressed={mode === 'internal'}><LockKeyhole size={15}/>{copy.internal}</button>}</div><p className={`support-compose-help ${mode === 'internal' ? 'is-internal' : ''}`}>{mode === 'internal' && <LockKeyhole size={15}/ >}{mode === 'internal' ? copy.internalHelp : copy.replyHelp}</p><label className="sr-only" htmlFor="support-compose-body">{mode === 'internal' ? copy.internal : copy.reply}</label><textarea id="support-compose-body" data-testid="support-reply-body" value={body} onChange={event => setBody(event.target.value)} placeholder={mode === 'internal' ? copy.writeNote : copy.writeReply} maxLength={5000} rows={4} disabled={mutationBusy}/>{localError && <p className="support-compose-error" role="alert">{localError}</p>}<div className="support-compose-footer"><small>{body.length} / 5000</small><button type="submit" data-testid="support-send" className="button button-primary" disabled={mutationBusy || !body.trim()}>{mutationBusy ? <span className="spinner"/> : mode === 'internal' ? <LockKeyhole size={16}/> : <Send size={16}/ >}{mutationBusy ? copy.sending : mode === 'internal' ? copy.saveNote : copy.sendReply}</button></div></form>}
    </> : <div className="support-placeholder" role="status">{copy.loadingThread}</div>}
  </section>;
}

export function SupportPage(props: SupportPageProps) {
  const { locale } = useLocale();
  const copy: Copy = supportText[locale];
  const { scope, venueName, venueOptions = [], venueSearch, filters, onFiltersChange, list, loading, error, onRetry, onOpen, onPageChange, selectedTicketId } = props;
  const [queryDraft, setQueryDraft] = useState(filters.query);
  const [selectedVenueOption, setSelectedVenueOption] = useState<AdminVenueOption | null>(null);
  useEffect(() => setQueryDraft(filters.query), [filters.query]);
  useEffect(() => { if (queryDraft === filters.query) return; const timer = window.setTimeout(() => onFiltersChange({ query: queryDraft, page: 1 }), 300); return () => window.clearTimeout(timer); }, [queryDraft, filters.query, onFiltersChange]);
  const summary = list?.summary;
  const active = (summary?.open || 0) + (summary?.in_progress || 0) + (summary?.waiting_tenant || 0);
  const hasFilters = !!(filters.query || filters.venueId || filters.status || filters.category || filters.priority || filters.assigned || filters.minAgeHours || filters.unreadOnly || filters.pendingOnly || filters.sort !== 'last_activity');
  const summaryCards = [{ label: copy.active, value: active, kind: 'active' }, { label: copy.pending, value: summary?.pending || 0, kind: 'pending' }, { label: copy.unread, value: summary?.unread || 0, kind: 'unread' }, ...(scope === 'platform' ? [{ label: copy.unassigned, value: summary?.unassigned_active || 0, kind: 'unassigned' }] : [])];
  const selectedVenue = filters.venueId ? (venueOptions.find(venue => venue.id === filters.venueId) || list?.items.find(ticket => ticket.venue_id === filters.venueId) && { id: filters.venueId, name: list.items.find(ticket => ticket.venue_id === filters.venueId)!.venue_name }) : undefined;
  const selectedComboboxVenue = selectedVenueOption?.id === filters.venueId ? selectedVenueOption : selectedVenue ? { id: selectedVenue.id, name: selectedVenue.name, slug: null, city: null, state: null, is_active: true, assigned_device: null } : null;
  const patch = (change: Partial<SupportFilters>) => onFiltersChange({ ...change, page: 1 });
  const page = list?.page ?? filters.page;
  const pageSize = list?.page_size ?? 25;
  const total = list?.total ?? 0;
  const pagination = { page, pageCount: Math.max(1, list?.pages ?? Math.ceil(total / pageSize)), pageSize, start: (page - 1) * pageSize, end: Math.min(total, page * pageSize), total, setPage: onPageChange, setPageSize: () => {} };
  return <div className={`page-stack support-page ${selectedTicketId ? 'support-with-thread' : ''}`} data-testid="support-page" data-support-scope={scope}>
    <div className="page-heading"><div><p className="eyebrow">{scope === 'platform' ? 'SaaS Admin' : venueName || copy.overview}</p><h1>{copy.title}</h1><p>{scope === 'platform' ? copy.platformLead : venueName ? copy.venueLead : copy.ownerLead}</p></div><div className="heading-accent" aria-hidden="true"><Inbox size={29}/></div></div>
    <div className="support-summary" role="group" aria-label={copy.overview} title={copy.filteredSummary}>{summaryCards.map(card => <div className={`support-summary-card is-${card.kind}`} key={card.kind}><span>{card.label}</span><strong>{list ? card.value : '—'}</strong></div>)}</div>
    <div className="support-layout"><section className="support-inbox" aria-labelledby="support-inbox-title"><div className="support-inbox-head"><div><p className="eyebrow">{scope === 'platform' ? copy.overview : venueName || copy.overview}</p><h2 id="support-inbox-title">{copy.inbox}</h2></div><span className="count-pill">{list?.total ?? '—'} {copy.showing}</span></div>
      <div className="support-filters"><label className="support-query"><span className="sr-only">{copy.search}</span><Search size={17}/><input type="search" value={queryDraft} onChange={event => setQueryDraft(event.target.value)} placeholder={copy.search}/></label>
        {!venueName && (scope === 'platform' && venueSearch ? <label className="support-filter"><span>{copy.venue}</span><VenueCombobox value={selectedComboboxVenue} onChange={venue => { setSelectedVenueOption(venue); patch({ venueId: venue?.id || '' }); }} search={venueSearch} emptyLabel={copy.allVenues} testId="support-venue-filter"/></label> : venueOptions.length > 1 && <label className="support-filter"><span>{copy.venue}</span><select aria-label={copy.venue} value={filters.venueId} onChange={event => patch({ venueId: event.target.value })}><option value="">{copy.allVenues}</option>{venueOptions.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>)}
        <label className="support-filter"><span>{copy.status}</span><select aria-label={copy.status} value={filters.status} onChange={event => patch({ status: event.target.value })}><option value="">{copy.all}</option>{statuses.map(status => <option key={status} value={status}>{copy[status]}</option>)}</select></label>
        <label className="support-filter"><span>{copy.category}</span><input value={filters.category} onChange={event => patch({ category: event.target.value })} placeholder={copy.any}/></label>
        <label className="support-filter"><span>{copy.priority}</span><select aria-label={copy.priority} value={filters.priority} onChange={event => patch({ priority: event.target.value })}><option value="">{copy.all}</option>{priorities.map(priority => <option key={priority} value={priority}>{copy[priority]}</option>)}</select></label>
        <label className="support-filter"><span>{copy.age}</span><select aria-label={copy.age} value={filters.minAgeHours} onChange={event => patch({ minAgeHours: event.target.value })}><option value="">{copy.any}</option><option value="24">{copy.hours24}</option><option value="72">{copy.hours72}</option><option value="168">{copy.week}</option></select></label>
        {scope === 'platform' && <label className="support-filter"><span>{copy.assigned}</span><select aria-label={copy.assigned} value={filters.assigned} onChange={event => patch({ assigned: event.target.value })}><option value="">{copy.all}</option><option value="me">{copy.mine}</option><option value="unassigned">{copy.unassignedFilter}</option>{props.assignableStaff?.map(staff => <option value={staff.user_id} key={staff.user_id}>{staff.name || staff.email}</option>)}</select></label>}
        <label className="support-filter"><span>{copy.sort}</span><select aria-label={copy.sort} value={filters.sort} onChange={event => patch({ sort: event.target.value })}><option value="last_activity">{copy.lastActivity}</option><option value="newest">{copy.newest}</option><option value="oldest">{copy.oldest}</option><option value="priority">{copy.prioritySort}</option></select></label>
      </div><div className="support-filter-foot"><label><input type="checkbox" checked={filters.pendingOnly} onChange={event => patch({ pendingOnly: event.target.checked })}/>{copy.pendingOnly}</label><label><input type="checkbox" checked={filters.unreadOnly} onChange={event => patch({ unreadOnly: event.target.checked })}/>{copy.unreadOnly}</label>{hasFilters && <button type="button" className="support-clear" onClick={() => { setQueryDraft(''); onFiltersChange(defaultSupportFilters); }}><SlidersHorizontal size={14}/>{copy.clear}</button>}</div>
      {error && <div className="support-list-error" role="alert"><span>{error}</span><button type="button" className="button button-secondary" onClick={onRetry}><RefreshCw size={15}/>{copy.retry}</button></div>}
      <div data-pagination-list="support" />
      {loading && !list ? <div className="support-placeholder" role="status"><span className="spinner"/>{copy.loading}</div> : !error && !loading && !list?.items.length ? <div className="support-placeholder"><Inbox size={33}/><strong>{hasFilters ? copy.noMatches : copy.empty}</strong></div> : <ul className="support-ticket-list" aria-busy={loading}>{list?.items.map(ticket => <TicketRow key={ticket.id} ticket={ticket} scope={scope} copy={copy} locale={locale} onOpen={onOpen}/>)}</ul>}
      {!!list?.pages && <PrintListPagination pagination={pagination} id="support" disabled={loading} fixedSize/>}
    </section>{selectedTicketId && <SupportThread {...props}/>}</div>
  </div>;
}
