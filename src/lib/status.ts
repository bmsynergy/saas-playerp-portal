import type { PrintServerSummary, SignalState } from './types';
// Five minutes proposed in the approved review. Pending final DEV confirmation.
export const SIGNAL_WINDOW_MS = 5 * 60 * 1000;
export function signalState(server: PrintServerSummary, now = Date.now()): SignalState {
  if (server.status === 'revoked') return 'revoked';
  if (!server.last_seen_at) return 'noSignal';
  const seen = Date.parse(server.last_seen_at);
  if (!Number.isFinite(seen)) return 'noSignal';
  return seen <= now && now - seen <= SIGNAL_WINDOW_MS ? 'online' : 'offline';
}
