import { AlertTriangle, Download } from 'lucide-react';
import { getInstallKitDownload, type InstallKit } from '../lib/firmware';

// PE-485: initial SD install kit for a firmware release (super_admin only, server enforced).
// Same mechanism as the firmware download: the edge returns a short-lived signed URL and the
// browser navigates to it. Downloading never signs, promotes or authorizes installing anything.
export async function downloadInstallKit(id: string): Promise<void> {
  const { url } = await getInstallKitDownload(id);
  window.location.assign(url);
}

const size = (bytes: number | null, missing: string) => bytes === null ? missing : `${(bytes / 1048576).toFixed(1)} MB`;

export function FirmwareInstallKit({ kit, t, onError }: { kit: InstallKit; t: (key: string) => string; onError: (error: unknown) => void }) {
  const missing = t('notProvided');
  return <div className="pe474-firmware-detail" data-testid={`fw-kit-${kit.id}`}>
    <div className="fw-focus-toolbar"><strong>{t('fw.kit.title')}</strong>
      <button type="button" className="button button-secondary" data-testid={`fw-kit-download-${kit.id}`} onClick={() => { downloadInstallKit(kit.id).catch(onError); }}><Download size={15}/>{t('fw.kit.download')}</button>
    </div>
    <p className="fw-notice" data-testid={`fw-kit-warning-${kit.id}`}><AlertTriangle size={15}/>{t('fw.kit.warning')}</p>
    <dl className="fw-release-facts">
      <div><dt>{t('fw.kit.profile')}</dt><dd>{kit.profile || missing}</dd></div>
      <div><dt>{t('fw.col.file')}</dt><dd>{kit.file_name}</dd></div>
      <div><dt>{t('fw.fileSize')}</dt><dd>{size(kit.bytes, missing)}</dd></div>
      <div><dt>SHA-256</dt><dd className="fw-hash" data-testid={`fw-kit-sha-${kit.id}`}>{kit.sha256}</dd></div>
      <div><dt>{t('fw.kit.baseImage')}</dt><dd>{kit.base_image_name ?? missing}</dd></div>
      <div><dt>{t('fw.kit.baseImageSha')}</dt><dd className="fw-hash">{kit.base_image_sha256 ?? missing}</dd></div>
    </dl>
  </div>;
}
