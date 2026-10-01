import { type ReactNode } from 'react';
import { Building2, Check, ChevronDown, Globe2, Mail, MapPin, Phone } from 'lucide-react';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';
import { StateView } from '../components/StateView';

type Props = { venues: OwnerVenue[]; selectedId: string; onSelect: (id: string) => void };

export function OwnerPage({ venues, selectedId, onSelect }: Props) {
  const { t } = useLocale();
  const selected = venues.find((venue) => venue.id === selectedId) ?? venues[0];
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{t('ownerArea')}</p><h1>{t('ownerWelcome')}</h1><p>{t('ownerLead')}</p></div><div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div></div>
    {venues.length === 0 ? <StateView kind="empty" message="emptyDirectory"/> : <>
      <section className="venue-selector-card" aria-labelledby="venue-selector-title"><div className="venue-selector-intro"><div className="selector-icon"><Building2 size={22}/></div><div><h2 id="venue-selector-title">{t('yourVenues')}</h2><p>{venues.length === 1 ? t('oneVenue') : `${venues.length} ${t('manyVenues')}`}</p></div></div>
        {venues.length > 1 && <label className="venue-select"><span>{t('selectVenue')}</span><span className="native-select-wrap"><select aria-label={t('selectVenue')} value={selected.id} onChange={(event) => onSelect(event.target.value)}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><ChevronDown size={18}/></span></label>}
      </section>
      <section className="owner-venue-card" aria-labelledby="owner-venue-title"><div className="owner-venue-top"><div><p className="eyebrow">{t('venueDetails')}</p><h2 id="owner-venue-title">{selected.name}</h2><div className="venue-subline"><MapPin size={16}/>{selected.city || t('notProvided')}{selected.slug && <><span className="subline-dot"/> {selected.slug}</>}</div></div><span className={`status-badge ${selected.is_active === true ? 'status-active' : selected.is_active === false ? 'status-inactive' : 'status-unknown'}`}><span className="badge-dot"/>{selected.is_active === true ? t('active') : selected.is_active === false ? t('inactive') : t('unknown')}</span></div>
        <div className="detail-grid"><DetailItem icon={<MapPin size={19}/>} label={t('address')} value={selected.address}/><DetailItem icon={<Globe2 size={19}/>} label={t('timezone')} value={selected.timezone}/><DetailItem icon={<Phone size={19}/>} label={t('phone')} value={selected.phone}/><DetailItem icon={<Mail size={19}/>} label={t('email')} value={selected.email} isEmail/></div>
      </section>
      {venues.length > 1 && <section className="venue-list-section"><div className="section-heading"><h2>{t('yourVenues')}</h2><span>{venues.length}</span></div><div className="venue-tile-grid">{venues.map((venue) => <button type="button" key={venue.id} className={`venue-tile ${venue.id === selected.id ? 'selected' : ''}`} onClick={() => onSelect(venue.id)}><span className="venue-tile-icon"><Building2 size={22}/></span><span className="venue-tile-copy"><strong>{venue.name}</strong><small>{venue.city || t('notProvided')}</small></span>{venue.id === selected.id && <Check size={19} className="venue-tile-check"/>}</button>)}</div></section>}
    </>}
  </div>;
}

export function DetailItem({ icon, label, value, isEmail = false }: { icon: ReactNode; label: string; value: string | null; isEmail?: boolean }) {
  const { t } = useLocale();
  return <div className="detail-item"><span className="detail-item-icon" aria-hidden="true">{icon}</span><div><span className="detail-item-label">{label}</span>{value && isEmail ? <a href={`mailto:${value}`}>{value}</a> : <strong>{value || t('notProvided')}</strong>}</div></div>;
}
