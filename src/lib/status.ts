import type { PrintServerSummary, SignalState } from './types';
// Aligned with the existing venue panel, confirmed by Tom in PE-321 DEV handoff.
export const SIGNAL_WINDOW_MS = 3 * 60 * 1000;
export function signalState(server: PrintServerSummary, now = Date.now()): SignalState {
  if (server.status === 'revoked') return 'revoked';
  if (server.status === 'pending') return 'pending';
  if (!server.last_seen_at) return 'noSignal';
  const seen = Date.parse(server.last_seen_at);
  if (!Number.isFinite(seen)) return 'noSignal';
  return seen <= now && now - seen < SIGNAL_WINDOW_MS ? 'online' : 'offline';
}
