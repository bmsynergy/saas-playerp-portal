import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { es } from '../src/locales/es';
import { en } from '../src/locales/en';
import { MemoryRouter } from 'react-router-dom';
import type { MaintenanceVenueList } from '../src/lib/maintenance';
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('../src/locales', () => ({useLocale:()=>({locale:'es',t:(key:string)=>(es as Record<string,string>)[key]??key})}));
import { MaintenancePage } from '../src/pages/MaintenancePage';
const data:MaintenanceVenueList={as_of:'2026-11-03T14:00:00Z',days:14,total:133,page:2,page_size:25,pages:6,query:null,summary:{venues:133,venues_with_problems:30,venues_last_night_problem:4,problem_nights:42,alert_recipients:1},venues:[{venue_id:"045",venue_name:"QA-120 Sede 045",timezone:"America/Puerto_Rico",required_since:"2026-10-01",today_local:"2026-11-03",problem_nights:2,last_night:{local_date:"2026-11-03",status:"running",problem:"stuck",failed_tasks:[],tasks_total:0},last_success_date:"2026-11-01"}]};
const render=()=>renderToStaticMarkup(createElement(MemoryRouter,null,createElement(MaintenancePage,{data,recipients:{recipients:[],candidates:[],effective_count:0,candidates_has_more:false},recipientsLoading:false,recipientsError:null,busy:false,mutationError:null,days:14,onDaysChange:vi.fn(),onRefresh:vi.fn(),onRecipientsRetry:vi.fn(),onSetRecipient:vi.fn(),query:"",onQueryChange:vi.fn(),onPageChange:vi.fn(),loading:false,overviewError:null})));
describe('maintenance page presentation',()=>{
 it('uses server-wide counts and a searchable venue input with server pagination',()=>{
  const html=render();
  expect(html).toContain('type="search"');
  expect(html).toContain('/admin/tenants/045/maintenance');
  expect(html).toContain('maintenance-status-stuck');
  expect(html).not.toContain('maintenance-night-toggle');
  expect(html).not.toContain('maintenance-problem-list');
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
