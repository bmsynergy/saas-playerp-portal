import { EMPTY_LIST_FILTERS } from './adminLists';
import type { OtaPageFilter } from './ota';
export const CHANNELS_PATH = '/admin/print-servers/channels';
export const CHANNEL_PAGE_SIZE = 25;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const id = (value: string | null) => value && uuid.test(value) ? value : '';
export function channelListState(params: URLSearchParams) {
  const channel = params.get('channel') ?? '';
  const status = params.get('status') ?? '';
  const n = Number(params.get('page'));
  const filters: OtaPageFilter = { ...EMPTY_LIST_FILTERS, query: params.get('q') ?? '',
    channel: ['lab','canary','general'].includes(channel) ? channel : '',
    status: ['active','pending','revoked','online','offline','all'].includes(status) ? status : '',
    venue_id: id(params.get('venue')), group_id: id(params.get('group')) };
  return { filters, page: Number.isSafeInteger(n) && n > 0 && n <= 1000000 ? n : 1,
    venueLabel: params.get('venueName') ?? '' };
}
// Return context can only point to this local administrative list; it never grants access.
export function channelsReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || /[\\#\r\n]/.test(value)) return null;
  const [path] = value.split('?');
  return path === CHANNELS_PATH ? value : null;
}
