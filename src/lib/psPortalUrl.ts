import type { FleetServer } from './printFleet';

// PE-603.4: use only the URL reported by this PS. Its firmware checks Host and
// Origin exactly; an IP or a guessed URL is not an alternative to this value.
export function validatedPsPortalUrl(server: Pick<FleetServer, 'hostname' | 'local_port' | 'last_status'> | null): string | null {
  const reported = server?.last_status?.portal_url;
  const hostname = server?.hostname;
  const port = server?.local_port;
  if (!reported || !hostname || !Number.isInteger(port) || port! < 1 || port! > 65535) return null;
  // Firmware inventory hostnames are single DNS labels, optionally reported
  // with their mDNS suffix. Refuse IPs, multiple labels and parser normalization.
  const label = hostname.endsWith('.local') ? hostname.slice(0, -6) : hostname;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) || /^\d+$/.test(label)) return null;
  try {
    const url = new URL(reported);
    const expectedHost = `${label}.local`;
    if (url.protocol !== 'https:' || url.hostname !== expectedHost ||
        Number(url.port || 443) !== port || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return null;
    // Require the canonical spelling too (no whitespace, encoded host, slash
    // normalization, dot segments, or empty query/fragment delimiters).
    const authority = `${expectedHost}${port === 443 ? '' : `:${port}`}`;
    if (reported !== `https://${authority}/`) return null;
    return reported;
  } catch { return null; }
}
