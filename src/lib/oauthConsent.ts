export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function consentRequestId(params: URLSearchParams): string | null {
  const values = params.getAll('request_id');
  return values.length === 1 && UUID.test(values[0]) ? values[0].toLowerCase() : null;
}

export function consentPath(id: string): string {
  return `/oauth/consent?request_id=${id.toLowerCase()}`;
}

export type ConsentContext = {
  request_id: string;
  client: { id: string; name: string; redirect_host: string | null };
  venues: { venue_id: string; nombre: string; concedida: boolean }[];
};

export function validConsentContext(value: unknown, requestId: string): value is ConsentContext {
  const c = value as ConsentContext | null;
  return !!c && c.request_id === requestId && !!c.client && typeof c.client.id === 'string'
    && typeof c.client.name === 'string' && (c.client.redirect_host === null || typeof c.client.redirect_host === 'string')
    && Array.isArray(c.venues) && c.venues.every(v => !!v && typeof v.venue_id === 'string'
      && UUID.test(v.venue_id) && typeof v.nombre === 'string' && typeof v.concedida === 'boolean')
    && new Set(c.venues.map(v => v.venue_id)).size === c.venues.length;
}

const KNOWN_ERRORS = ['mcp_request_unknown', 'mcp_request_expired', 'mcp_request_already_decided',
  'mcp_consent_denied', 'mcp_consent_no_venues', 'mcp_consent_not_owner',
  'mcp_piloto_owner_no_permitido', 'mcp_piloto_una_sola_sede', 'mcp_piloto_sede_no_permitida'];

export function consentErrorKey(error: unknown, fallback = 'oauth.failed'): string {
  const e = error as { message?: string; code?: string; status?: number } | null;
  if (e?.code === 'PGRST301' || e?.code === 'PGRST303' || e?.status === 401) return 'oauth.sessionExpired';
  const hit = KNOWN_ERRORS.find(key => String(e?.message ?? '').includes(key));
  return hit ? `oauth.err.${hit}` : fallback;
}

// The registered callback comes only from the RPC. Never use redirect_uri/next from the incoming URL.
// Mirror the gateway's web/loopback policy and match the destination shown before consent.
export function consentRedirect(value: unknown, host: string | null): string | null {
  if (typeof value !== 'string' || !host) return null;
  try {
    const url = new URL(value);
    // SQL preserves the registered authority's spelling; URL normalizes case and default ports.
    if (/[/?#@\\]/.test(host)) return null;
    const displayed = new URL(`${url.protocol}//${host}`);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return !url.username && !url.password && url.host === displayed.host
      && (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) ? url.href : null;
  } catch { return null; }
}
