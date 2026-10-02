// SHA-256 of DER is the device fingerprint; SHA-256 of PEM text is not.
export function formatFingerprint(value: string | null): string | null {
  const hex = value?.replace(/:/g, '').toUpperCase();
  return hex && /^[A-F0-9]{64}$/.test(hex) ? hex.match(/.{2}/g)!.join(':') : null;
}
export function certificateFilename(venueId: string): string {
  return `playerp-${venueId.replace(/[^a-zA-Z0-9-]/g, '').slice(0,64) || 'venue'}-ca.crt`;
}
export async function certificateDerFingerprint(pem: string): Promise<string> {
  const match = /^\s*-----BEGIN CERTIFICATE-----\s+([A-Za-z0-9+/=\s]+)\s+-----END CERTIFICATE-----\s*$/.exec(pem);
  if (!match) throw new Error('invalid certificate');
  const bytes = Uint8Array.from(atob(match[1].replace(/\s/g, '')), c => c.charCodeAt(0));
  if (bytes.length < 32 || bytes[0] !== 0x30) throw new Error('invalid certificate');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
