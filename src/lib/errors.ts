import type { UiError } from './types';
export class PortalError extends Error {
  constructor(public code: UiError) { super(code); }
}
export function errorCode(error: unknown): UiError {
  if (error instanceof PortalError) return error.code;
  const e = error as { code?: string; status?: number; name?: string } | null;
  if (e?.code === 'invalid_credentials') return 'invalidCredentials';
  if (e?.code === 'weak_password' || e?.code === 'same_password') return 'weakPassword';
  if (e?.code === 'otp_expired' || e?.code === 'flow_state_expired' || e?.code === 'flow_state_not_found') return 'invalidLink';
  if (e?.status === 429 || e?.code === 'over_email_send_rate_limit' || e?.code === 'over_request_rate_limit') return 'rateLimited';
  if (e?.code === '42501' || e?.status === 403) return 'accessDenied';
  if (e?.status === 401 || ['refresh_token_not_found','refresh_token_already_used','session_not_found','bad_jwt'].includes(e?.code ?? '')) return 'sessionExpired';
  if (e?.name === 'AuthRetryableFetchError' || e?.name === 'TypeError') return 'networkError';
  return 'genericError';
}
