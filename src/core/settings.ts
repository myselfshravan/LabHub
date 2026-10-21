/**
 * Typed, versionless settings stored in `chrome.storage.sync`.
 *
 * Reads are always deep-merged over DEFAULT_SETTINGS so new keys added in later versions get
 * sane values without a migration step.
 */
import { storage } from 'wxt/utils/storage';

export type FreshnessMode = 'auto' | 'banner';

export interface FreshnessSettings {
  /** Re-check when the tab becomes visible again. */
  onFocus: boolean;
  /** Only re-check on focus if the tab was hidden at least this long. */
  hiddenThresholdSec: number;
  /** Poll for changes while the tab is visible. */
  poll: boolean;
  pollIntervalSec: number;
  /**
   * `auto`: refresh stale pages in the background (hidden tabs at once, the visible tab once
   * the user pauses), never while something would be lost.
   * `banner`: never reload by itself, always ask via the banner.
   */
  mode: FreshnessMode;
  /** Pages without a fingerprint (blob, tree, settings...) reload on focus after this long hidden. 0 = never. */
  genericReloadAfterSec: number;
  /** Prefix the tab title with the MR/pipeline CI status. */
  titleStatus: boolean;
  /** Desktop notification when CI finishes / an MR is merged or approved while you're away. */
  notify: boolean;
  /**
   * A visible tab with no mouse/keyboard activity this long counts as "away": polling pauses,
   * and your next interaction is treated like returning to the tab. 0 = off.
   */
  idleAfterSec: number;
}

export interface Settings {
  /** Master switch. */
  enabled: boolean;
  /** Per-feature toggles; missing ids fall back to the feature's `defaultOn`. */
  features: Record<string, boolean>;
  freshness: FreshnessSettings;
  /** Mirror debug-level logs to the console. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  features: {},
  freshness: {
    onFocus: true,
    hiddenThresholdSec: 5,
    poll: true,
    pollIntervalSec: 30,
    mode: 'auto',
    genericReloadAfterSec: 300,
    titleStatus: true,
    notify: true,
    idleAfterSec: 120,
  },
  debug: false,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursively fills missing keys of `value` from `defaults`. Arrays and primitives are taken as-is. */
export function mergeDefaults<T>(defaults: T, value: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(value)) {
    return (value === undefined || value === null ? defaults : value) as T;
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(value)) {
    out[k] = k in defaults ? mergeDefaults((defaults as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

const settingsItem = storage.defineItem<DeepPartial<Settings>>('sync:settings', { fallback: {} });

export async function getSettings(): Promise<Settings> {
  return mergeDefaults(DEFAULT_SETTINGS, await settingsItem.getValue());
}

/**
 * Stores only the user's own values (what was stored, plus the patch), never the defaults, so a
 * default changed in a later version still reaches everyone who didn't override that key.
 */
export async function updateSettings(patch: DeepPartial<Settings>): Promise<Settings> {
  const next = mergeDefaults(await settingsItem.getValue(), patch);
  await settingsItem.setValue(next);
  return mergeDefaults(DEFAULT_SETTINGS, next);
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  return settingsItem.watch((v) => cb(mergeDefaults(DEFAULT_SETTINGS, v)));
}

export function isFeatureOn(s: Settings, id: string, defaultOn: boolean): boolean {
  return s.enabled && (s.features[id] ?? defaultOn);
}
