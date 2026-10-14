/**
 * Feature contract. A feature is a self-contained unit that the registry starts on matching
 * pages and tears down on navigation, toggle-off, or settings change. Anything a feature adds
 * to the page must be removed by its cleanup (use `ctx.onCleanup` / `ctx.signal`).
 */
import type { GitLabApi } from './api';
import type { Logger } from './logger';
import type { PageContext } from './page';
import type { Settings } from './settings';

export type Cleanup = () => void;

export interface FeatureContext {
  page: PageContext;
  settings: Settings;
  api: GitLabApi;
  log: Logger;
  /** Aborted when the feature is torn down; pass it to fetch/addEventListener. */
  signal: AbortSignal;
  onCleanup(fn: Cleanup): void;
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  defaultOn: boolean;
  /** Restrict to some pages. Omit to run everywhere on GitLab. */
  matches?(page: PageContext): boolean;
  /** Injected while the feature runs, removed on teardown. */
  css?: string;
  /**
   * Which slice of settings the feature depends on; a change restarts the feature.
   * Defaults to nothing besides its own toggle.
   */
  settingsKey?(s: Settings): unknown;
  init(ctx: FeatureContext): void | Cleanup | Promise<void | Cleanup>;
}

export const defineFeature = (f: Feature): Feature => f;
