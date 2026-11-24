import type { CheckModule } from '../../../core/module.js';
import type { ManifestJson } from '../manifest/shared.js';
import { mod07 } from './mod-07-push.js';
import { modernApiCheck } from './shared.js';

const has = (json: ManifestJson | undefined, key: string): boolean =>
  !!json && json[key] !== undefined && json[key] !== null;

// Advisory Modern-API detectors (SPEC §10). Not scored.
export const modernApiChecks: CheckModule[] = [
  modernApiCheck({
    id: 'MOD-01',
    title: 'Share Target API',
    detect: (j) => has(j, 'share_target'),
    note: 'Chromium/Android supported; not on iOS Safari.',
  }),
  modernApiCheck({
    id: 'MOD-02',
    title: 'File Handling API',
    detect: (j) => has(j, 'file_handlers'),
    note: 'Chromium desktop only; not on Firefox/Safari.',
  }),
  modernApiCheck({
    id: 'MOD-03',
    title: 'Launch Handler API',
    detect: (j) => has(j, 'launch_handler'),
    note: 'Chromium only.',
  }),
  modernApiCheck({
    id: 'MOD-04',
    title: 'Window Controls Overlay',
    detect: (j) =>
      Array.isArray(j?.display_override) &&
      (j?.display_override as unknown[]).includes('window-controls-overlay'),
    note: 'Chromium desktop only.',
  }),
  modernApiCheck({
    id: 'MOD-05',
    title: 'Protocol Handlers',
    detect: (j) => has(j, 'protocol_handlers'),
    note: 'Chromium/Firefox supported; limited on Safari.',
  }),
  modernApiCheck({
    id: 'MOD-06',
    title: 'Shortcuts',
    detect: (j) => Array.isArray(j?.shortcuts) && (j?.shortcuts as unknown[]).length > 0,
    note: 'Chromium/Android supported; not on iOS Safari.',
  }),
  mod07,
];
