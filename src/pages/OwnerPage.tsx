import { type ReactNode } from 'react';
import { ArrowRight, Building2, MapPin } from 'lucide-react';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';
import { StateView } from '../components/StateView';
import { VenueDetailsPanel } from './VenueSections';

import type { OwnerSection } from '../hooks/useOwnerNavigation';
type Props = { venues: OwnerVenue[]; selectedId: string; section: OwnerSection; onSelect: (id: string) => void; users?: ReactNode; printServers?: ReactNode };

function VenueStatus({ venue }: { venue: OwnerVenue }) {
  const { t } = useLocale();
  return <span className={`status-badge ${venue.is_active === true ? 'status-active' : venue.is_active === false ? 'status-inactive' : 'status-unknown'}`}>
    <span className="badge-dot" />{venue.is_active === true ? t('active') : venue.is_active === false ? t('inactive') : t('unknown')}
  </span>;
}

export function OwnerPage({ venues, selectedId, section, onSelect, users, printServers }: Props) {
  const { t } = useLocale();
  const selected = venues.find((venue) => venue.id === selectedId);

  return <div className="page-stack owner-workspace">
    <div className="page-heading"><div><p className="eyebrow">{t('ownerArea')}</p><h1>{t('ownerWelcome')}</h1><p>{t('ownerLead')}</p></div><div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div></div>
    {!selectedId ? <section className="owner-overview" data-testid="owner-overview" aria-labelledby="owner-venues-title">
      <div className="section-heading"><div><h2 id="owner-venues-title">{t('venues')}</h2><p className="owner-section-lead">{venues.length === 1 ? t('oneVenue') : `${venues.length} ${t('manyVenues')}`}</p></div></div>
      {venues.length === 0 ? <StateView kind="empty" message="emptyDirectory" /> : <div className="owner-overview-grid">
        {venues.map((venue) => <button type="button" key={venue.id} className="owner-overview-card" data-testid={`owner-venue-tile-${venue.id}`} onClick={() => onSelect(venue.id)} aria-label={`${t('viewVenue')}: ${venue.name}`}>
          <span className="owner-card-icon" aria-hidden="true"><Building2 size={22}/></span>
          <span className="owner-card-copy"><strong>{venue.name}</strong><span className="owner-card-location"><MapPin size={15}/>{[venue.city, venue.state].filter(Boolean).join(', ') || venue.address || t('notProvided')}</span>{venue.address && <small>{venue.address}</small>}</span>
          <VenueStatus venue={venue}/><ArrowRight className="owner-card-arrow" size={18} aria-hidden="true"/>
        </button>)}
      </div>}
    </section> : !selected ? <StateView kind="empty" message="emptyDirectory" /> : section === 'users' ? users ?? <StateView kind="empty" message="emptyBody" /> : section === 'print-servers' ? printServers ?? <StateView kind="empty" message="emptyBody" /> : section === 'details' ? <VenueDetailsPanel venue={selected} scope="owner" /> : <section className="owner-venue-card" data-testid="owner-dashboard" aria-labelledby="owner-dashboard-title">
      <div className="owner-venue-top"><div><p className="eyebrow">{t('ownerDashboard')}</p><h2 id="owner-dashboard-title">{selected.name}</h2><p className="owner-section-lead">{t('ownerDashboardLead')}</p></div><VenueStatus venue={selected}/></div>
      <div className="owner-dashboard-facts"><div><span>{t('city')}</span><strong>{[selected.city, selected.state].filter(Boolean).join(', ') || t('notProvided')}</strong></div><div><span>{t('address')}</span><strong>{selected.address || t('notProvided')}</strong></div></div>
    </section>}
  </div>;
}

export { DetailItem } from './VenueSections';
