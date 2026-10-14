/**
 * Runs the enabled features for the current page and keeps them in sync with navigation and
 * settings. Each feature is isolated: a throw in one never affects the others or the page.
 */
import type { GitLabApi } from './api';
import type { Cleanup, Feature, FeatureContext } from './feature';
import type { Logger } from './logger';
import type { PageContext } from './page';
import { isFeatureOn, type Settings } from './settings';

interface Running {
  /** Restart key: changes when the feature must be re-initialized. */
  key: string;
  abort: AbortController;
  cleanups: Cleanup[];
}

export interface Registry {
  sync(page: PageContext, settings: Settings): void;
  stopAll(): void;
  running(): string[];
}

export function createRegistry(features: Feature[], api: GitLabApi, log: Logger): Registry {
  const running = new Map<string, Running>();

  const stop = (id: string) => {
    const r = running.get(id);
    if (!r) return;
    running.delete(id);
    r.abort.abort();
    for (const fn of r.cleanups.reverse()) {
      try {
        fn();
      } catch (err) {
        log.error(`cleanup of "${id}" failed`, err);
      }
    }
    log.debug(`stopped ${id}`);
  };

  const start = (f: Feature, key: string, page: PageContext, settings: Settings) => {
    const abort = new AbortController();
    const entry: Running = { key, abort, cleanups: [] };
    running.set(f.id, entry);
    const flog = log.child(f.id);
    const ctx: FeatureContext = {
      page,
      settings,
      api,
      log: flog,
      signal: abort.signal,
      onCleanup: (fn) => entry.cleanups.push(fn),
    };
    if (f.css) {
      const style = document.createElement('style');
      style.dataset.bgl = f.id;
      style.textContent = f.css;
      document.head.append(style);
      entry.cleanups.push(() => style.remove());
    }
    const fail = (err: unknown) => flog.error('init failed', err);
    try {
      void Promise.resolve(f.init(ctx))
        .then((cleanup) => {
          if (!cleanup) return;
          // Torn down while init was pending: clean up immediately.
          if (abort.signal.aborted) cleanup();
          else entry.cleanups.push(cleanup);
        })
        .catch(fail);
    } catch (err) {
      fail(err);
    }
    flog.debug('started', { page: page.kind });
  };

  return {
    sync(page, settings) {
      for (const f of features) {
        const want = isFeatureOn(settings, f.id, f.defaultOn) && (f.matches?.(page) ?? true);
        const key = want ? JSON.stringify([page.key, f.settingsKey?.(settings) ?? null]) : '';
        const cur = running.get(f.id);
        if (cur && cur.key === key) continue;
        if (cur) stop(f.id);
        if (want) start(f, key, page, settings);
      }
    },
    stopAll() {
      for (const id of [...running.keys()]) stop(id);
    },
    running: () => [...running.keys()],
  };
}
