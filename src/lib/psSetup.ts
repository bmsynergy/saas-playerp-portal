import type { InstallKit } from './firmware';
import type { FirmwareRing } from './firmwareEligibility';
import type { PsPreparationState } from './psLink';

// PE-486: guided Setup of a Print Server from the generic bootable image. Every state comes
// only from server data: the browser cannot know whether the image was downloaded or flashed.
export type SetupStepKey = 'download' | 'flash' | 'boot' | 'prepare' | 'link' | 'online' | 'channel';
export type SetupStepState = 'done' | 'current' | 'pending' | 'error';
export type SetupStep = { key: SetupStepKey; state: SetupStepState };
export type SetupInput = { preparation: PsPreparationState; prepared: boolean; online: boolean; ring: FirmwareRing | null };
export type SetupProgress = { steps: SetupStep[]; done: number; total: number; codeExpired: boolean };
export const SETUP_CHECKS: readonly SetupStepKey[] = ['prepare', 'link', 'online', 'channel'];

export function setupProgress({ preparation, prepared: flag, online, ring }: SetupInput): SetupProgress {
  const prepared = flag || preparation === 'prepared', codeExpired = !prepared && preparation === 'code_expired';
  const issued = prepared || preparation === 'code_issued';
  const local: SetupStepState = prepared ? 'done' : 'current';
  const state: Record<SetupStepKey, SetupStepState> = {
    download: local, flash: local, boot: local,
    prepare: issued ? 'done' : codeExpired ? 'error' : 'current',
    link: prepared ? 'done' : issued ? 'current' : 'pending',
    online: online ? 'done' : prepared ? 'current' : 'pending',
    channel: online && ring ? 'done' : online ? 'current' : 'pending',
  };
  const steps = (['download', 'flash', 'boot', 'prepare', 'link', 'online', 'channel'] as const).map(key => ({ key, state: state[key] }));
  return { steps, done: SETUP_CHECKS.filter(key => state[key] === 'done').length, total: SETUP_CHECKS.length, codeExpired };
}

// Newest generic bootable image; kits without a date sort last.
export function pickBootableImage(kits: InstallKit[]): InstallKit | null {
  const at = (kit: InstallKit) => { const v = kit.created_at ? Date.parse(kit.created_at) : NaN; return Number.isFinite(v) ? v : -1; };
  return kits.filter(kit => kit.kind === 'bootable_image').sort((a, b) => at(b) - at(a))[0] ?? null;
}

export const setupFileSize = (bytes: number | null, missing: string) => bytes === null ? missing : `${(bytes / 1048576).toFixed(1)} MB`;
export const shaCommand = (fileName: string) => `shasum -a 256 ${fileName}`;
