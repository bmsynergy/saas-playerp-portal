import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { es } from '../src/locales/es';
import { en } from '../src/locales/en';
import type { MaintenanceOverview } from '../src/lib/maintenance';
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('../src/locales', () => ({useLocale:()=>({locale:'es',t:(key:string)=>(es as Record<string,string>)[key]??key})}));
import { MaintenancePage } from '../src/pages/MaintenancePage';
const data:MaintenanceOverview={as_of:'2026-11-03T14:00:00Z',days:14,total:133,page:2,page_size:25,pages:6,problems_total:42,summary:{venues:133,venues_with_problems:30,problem_nights:42,alert_recipients:1},problems:[],venues:[]};
const render=()=>renderToStaticMarkup(createElement(MaintenancePage,{data,recipients:{recipients:[],candidates:[],effective_count:0,candidates_has_more:false},recipientsLoading:false,recipientsError:null,busy:false,mutationError:null,days:14,onDaysChange:vi.fn(),onRefresh:vi.fn(),onRecipientsRetry:vi.fn(),onSetRecipient:vi.fn(),venue:null,onVenueChange:vi.fn(),onPageChange:vi.fn(),loading:false,overviewError:null}));
describe('maintenance page presentation',()=>{
 it('uses server-wide counts and a searchable venue input with server pagination',()=>{
  const html=render();
  expect(html).toContain('role="combobox"');
  expect(html).toContain('maintenance-pagination');
  expect(html).toContain('133');
  expect(html).toContain('42');
  expect(html).not.toContain('maintenance-candidate');
 });
 it('provides Spanish and English text for all maintenance messages',()=>{
  for(const key of Object.keys(es).filter(key=>key.startsWith('maintenance.'))){expect((en as Record<string,string>)[key],key).toBeTruthy();}
  for(const key of Object.keys(en).filter(key=>key.startsWith('maintenance.'))){expect((es as Record<string,string>)[key],key).toBeTruthy();}
 });
});
