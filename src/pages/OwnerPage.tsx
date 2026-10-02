import { useEffect, useState, type ReactNode } from 'react';
import { Building2, Check, ChevronDown, MapPin } from 'lucide-react';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';
import { StateView } from '../components/StateView';
import { VenueDetailsPanel, VenueSectionTabs, type VenueSection } from './VenueSections';

// `users` is mounted by the route only for a venue the person owns.
type Props = { venues: OwnerVenue[]; selectedId: string; onSelect: (id: string) => void; users?: ReactNode; printServers?: ReactNode };

export function OwnerPage({ venues, selectedId, onSelect, users, printServers }: Props) {
  const { t } = useLocale();
  const selected = venues.find((venue) => venue.id === selectedId) ?? venues[0];
  const [tab, setTab] = useState<VenueSection>('overview');
  useEffect(() => setTab('overview'), [selectedId]);
  const activeTab = tab === 'users' && users === undefined || tab === 'print-servers' && printServers === undefined ? 'overview' : tab;
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{t('ownerArea')}</p><h1>{t('ownerWelcome')}</h1><p>{t('ownerLead')}</p></div><div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div></div>
    {venues.length === 0 ? <StateView kind="empty" message="emptyDirectory"/> : <>
      <section className="venue-selector-card" aria-labelledby="venue-selector-title"><div className="venue-selector-intro"><div className="selector-icon"><Building2 size={22}/></div><div><h2 id="venue-selector-title">{t('yourVenues')}</h2><p>{venues.length === 1 ? t('oneVenue') : `${venues.length} ${t('manyVenues')}`}</p></div></div>
        {venues.length > 1 && <label className="venue-select"><span>{t('selectVenue')}</span><span className="native-select-wrap"><select aria-label={t('selectVenue')} value={selected.id} onChange={(event) => onSelect(event.target.value)}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><ChevronDown size={18}/></span></label>}
      </section>
      <div className="owner-venue-top owner-venue-context"><div><p className="eyebrow">{t('venueDetails')}</p><h2 id="owner-venue-title">{selected.name}</h2><div className="venue-subline"><MapPin size={16}/>{selected.city || t('notProvided')}{selected.slug && <><span className="subline-dot"/> {selected.slug}</>}</div></div><span className={`status-badge ${selected.is_active === true ? 'status-active' : selected.is_active === false ? 'status-inactive' : 'status-unknown'}`}><span className="badge-dot"/>{selected.is_active === true ? t('active') : selected.is_active === false ? t('inactive') : t('unknown')}</span></div>
      <VenueSectionTabs active={activeTab} users={users !== undefined} printServers={printServers !== undefined} render={(item, active) => <button key={item.section} type="button" className={`detail-tab ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} data-testid={item.testId} onClick={() => setTab(item.section)}>{item.icon}{item.label}</button>}/>
      {activeTab === 'users' ? users : activeTab === 'print-servers' ? printServers : <VenueDetailsPanel venue={selected} scope="owner"/>}
      {venues.length > 1 && <section className="venue-list-section"><div className="section-heading"><h2>{t('yourVenues')}</h2><span>{venues.length}</span></div><div className="venue-tile-grid">{venues.map((venue) => <button type="button" key={venue.id} className={`venue-tile ${venue.id === selected.id ? 'selected' : ''}`} onClick={() => onSelect(venue.id)}><span className="venue-tile-icon"><Building2 size={22}/></span><span className="venue-tile-copy"><strong>{venue.name}</strong><small>{venue.city || t('notProvided')}</small></span>{venue.id === selected.id && <Check size={19} className="venue-tile-check"/>}</button>)}</div></section>}
    </>}
  </div>;
}

export { DetailItem } from './VenueSections';
