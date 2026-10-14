import { supabase } from './supabase';
import { SUPABASE_URL } from './config';
import { PortalError } from './errors';
import { projectFirmwareLifecycle, type FirmwareLifecycle, type FirmwareRing } from './firmwareLifecycle';

// Firmware releases uploaded by platform Admins. Uploading never installs anything: the
// backend creates no Print Server command. The SHA-256 shown is the one the server computed
// on the stored object; the browser only computes its own to compare.
export type FirmwareRelease = {
  id: string; version: string; revision: string | null; model: string; arch: string; notes: string | null; filename: string;
  size_bytes: number | null; sha256: string | null; status: 'ready' | 'rejected'; errors: string[]; entries: number | null;
  created_at: string | null; uploaded_by_email: string | null; installed_count: number;
  lifecycle: FirmwareLifecycle | null;
};
export type InstalledVersion = { version: string; print_servers: number; uploaded: boolean };
export type FirmwareList = { releases: FirmwareRelease[]; installed: InstalledVersion[]; complete: boolean; total: number | null };
export type FirmwareUpload = { file: File; version: string; revision: string; model: string; arch: string; notes: string };
export class FirmwareError extends Error { constructor(public key: string, public release?: FirmwareRelease) { super(key); } }

type Raw = Record<string, unknown>;
const str = (v: unknown) => typeof v === 'string' && v !== '' ? v : null;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
function release(v: Raw): FirmwareRelease {
  if (typeof v.id !== 'string' || typeof v.version !== 'string' || (v.status !== 'ready' && v.status !== 'rejected')) throw new PortalError('genericError');
  const validation = (v.validation && typeof v.validation === 'object' ? v.validation : {}) as Raw;
  return { id: v.id, version: v.version, revision: str(v.revision), model: String(v.model ?? ''), arch: String(v.arch ?? ''), notes: str(v.notes),
    filename: String(v.filename ?? ''), size_bytes: num(v.size_bytes), sha256: str(v.sha256), status: v.status,
    errors: Array.isArray(validation.errors) ? validation.errors.filter((e): e is string => typeof e === 'string') : [],
    entries: num(validation.entries), created_at: str(v.created_at), uploaded_by_email: str(v.uploaded_by_email), installed_count: num(v.installed_count) ?? 0,
    lifecycle: projectFirmwareLifecycle(v.lifecycle) };
}

export async function getFirmwares(signal?: AbortSignal): Promise<FirmwareList> {
  const { data, error } = await supabase.rpc('ps_firmware_list').abortSignal(signal ?? new AbortController().signal);
  if (error) throw error;
  if (!data || !Array.isArray(data.releases) || !Array.isArray(data.installed)) throw new PortalError('genericError');
  return { releases: data.releases.map(release), complete: data.complete === true && data.total === data.releases.length,
    total: num(data.total),
    installed: data.installed.map((v: Raw) => ({ version: String(v.version ?? ''), print_servers: num(v.print_servers) ?? 0, uploaded: v.uploaded === true })) };
}

const errorKeys: Record<string, string> = {
  invalid_version: 'fw.error.version', invalid_filename: 'fw.error.filename', invalid_size: 'fw.error.size', invalid_model: 'fw.error.model',
  invalid_arch: 'fw.error.arch', invalid_zip: 'fw.error.zip', duplicate: 'fw.error.duplicate', not_uploaded: 'fw.error.upload',
  unknown_upload: 'fw.error.upload', forbidden: 'accessDenied',
  confirmation_required: 'fw.lifecycle.error.confirmationRequired', release_changed: 'fw.lifecycle.error.releaseChanged',
  availability_changed: 'fw.lifecycle.error.availabilityChanged', edition_retired: 'fw.lifecycle.error.retired',
  ring_disabled: 'fw.lifecycle.error.ringDisabled', canary_not_confirmed: 'ota.error.canaryNotConfirmed',
  edition_lab_only: 'fw.lifecycle.error.labOnly', edition_not_signed: 'fw.lifecycle.error.notSigned',
  installed: 'fw.error.deleteInstalled', deployment_in_progress: 'fw.error.deleteInProgress',
  not_found: 'fw.error.deleteNotFound', bad_id: 'fw.error.deleteInvalid',
};
async function call(body: Raw): Promise<Raw> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new PortalError('sessionExpired');
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/ps-firmware-admin`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new PortalError('networkError'); }
  const data = await response.json().catch(() => null) as Raw | null;
  if (response.status === 401) throw new PortalError('sessionExpired');
  if (response.status === 403) throw new PortalError('accessDenied');
  if (!response.ok || !data || data.ok !== true) {
    const code = typeof data?.error === 'string' ? data.error : '';
    const r = data?.release && typeof data.release === 'object' ? release(data.release as Raw) : undefined;
    throw new FirmwareError(errorKeys[code] ?? 'genericError', r);
  }
  return data;
}

export async function sha256OfFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 1) reserve + signed upload URL, 2) browser uploads to the private bucket, 3) the server
// hashes and validates the stored object.
export async function uploadFirmware(input: FirmwareUpload, onStage?: (stage: 'upload' | 'verify') => void): Promise<FirmwareRelease> {
  const begun = await call({ action: 'begin', filename: input.file.name, size: input.file.size, version: input.version.trim(),
    revision: input.revision.trim() || null, model: input.model, arch: input.arch, notes: input.notes.trim() || null });
  onStage?.('upload');
  const { error } = await supabase.storage.from(String(begun.bucket)).uploadToSignedUrl(String(begun.path), String(begun.token), input.file,
    { contentType: 'application/zip', upsert: false });
  if (error) throw new FirmwareError('fw.error.upload');
  onStage?.('verify');
  const done = await call({ action: 'finalize', id: begun.id });
  return release(done.release as Raw);
}

export async function firmwareDownloadUrl(id: string): Promise<string> {
  const data = await call({ action: 'download', id });
  if (typeof data.url !== 'string') throw new PortalError('genericError');
  return data.url;
}

// PE-416: authorization and in-use checks belong to Tom's DEV endpoint.
export async function deleteFirmware(id: string): Promise<{ fileRemoved: boolean }> {
  const data = await call({ action: 'delete', id });
  const deleted = data.deleted as Raw | undefined;
  if (!deleted || deleted.id !== id || typeof data.file_removed !== 'boolean') throw new PortalError('genericError');
  return { fileRemoved: data.file_removed };
}

// Ad hoc lifecycle writes never touch PE-416 delete, signed manifests or canary confirmation.
// RPC authenticates auth.uid(), checks optimistic revision and audits atomically on the server.
export async function setFirmwareAvailability(editionId: string, enabledRings: FirmwareRing[], retired: boolean, expectedRevision: number): Promise<void> {
  const { data, error } = await supabase.rpc('ps_ota_edition_availability_set', {
    p_edition_id: editionId, p_enabled_rings: enabledRings, p_retired: retired, p_expected_revision: expectedRevision,
  });
  if (error) throw error;
  if (!data || data.ok !== true) throw new FirmwareError(data?.error === 'deployment_in_progress'
    ? 'fw.lifecycle.reason.deployment_in_progress' : errorKeys[String(data?.error)] ?? 'genericError');
}
