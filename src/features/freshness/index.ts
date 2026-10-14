/**
 * Freshness: GitLab pages go stale (MR status, pipelines, approvals, lists) because most of the
 * page is server-rendered once and polling is partial. We take an API fingerprint of what the
 * page shows, re-check it on the triggers below, and when it differs either reload (if the
 * user just came back to the tab and nothing would be lost) or show an "updates" banner.
 *
 * Triggers:
 *  - return to the tab (visibility/focus) after being away ≥ hiddenThresholdSec → may auto-reload
 *  - back/forward-cache restore and network coming back online → may auto-reload
 *  - polling while visible → banner only (never yank the page from under someone reading it)
 *
 * Pages without a fingerprint (code, settings, ...) simply reload when returned to after
 * genericReloadAfterSec, under the same safety rules.
 */
import { ApiError } from '@/core/api';
import { defineFeature } from '@/core/feature';
import { createBanner } from './banner';
import {
  describeChange,
  diffFingerprints,
  fetcherFor,
  type Change,
  type Fingerprint,
} from './fingerprint';
import { unsafeReason } from './safety';
import { restoreScroll, saveScroll } from './scroll';
import { createTitleStatus } from './title';

type Trigger = 'init' | 'focus' | 'poll' | 'online' | 'bfcache';

/** Triggers where the user is (re)arriving, so a reload isn't disruptive. */
const ARRIVAL: ReadonlySet<Trigger> = new Set(['focus', 'online', 'bfcache']);

export default defineFeature({
  id: 'freshness',
  title: 'Keep pages fresh',
  description:
    'Detects when MR/pipeline/issue/list pages are out of date and reloads them when you come back to the tab, or shows an "updates available" banner.',
  defaultOn: true,
  settingsKey: (s) => s.freshness,

  init({ page, settings, api, log, signal, onCleanup }) {
    const cfg = settings.freshness;
    const fetchFingerprint = fetcherFor(page, api);
    const title = createTitleStatus();
    onCleanup(() => title.destroy());

    let baseline: Fingerprint | undefined;
    let fingerprintDisabled = !fetchFingerprint;
    let inFlight = false;
    let awaySince: number | undefined;
    let dismissedSig: string | undefined;
    let lastSig: string | undefined;

    const reload = (why: string) => {
      log.info(`reloading: ${why}`);
      saveScroll(page.key);
      location.reload();
    };

    const banner = createBanner(
      () => reload('banner clicked'),
      () => {
        dismissedSig = lastSig;
        log.debug('banner dismissed');
      },
    );
    onCleanup(() => banner.destroy());

    const announce = (changes: Change[]) => {
      const sig = JSON.stringify(changes);
      lastSig = sig;
      if (sig === dismissedSig) return;
      const lines = changes.map(describeChange);
      banner.show('This page has updates', lines.slice(0, 2).join(' · '));
    };

    /** Reload if allowed and safe; otherwise fall back to the banner. */
    const act = (trigger: Trigger, changes: Change[]) => {
      if (ARRIVAL.has(trigger) && cfg.mode === 'auto') {
        const unsafe = unsafeReason();
        if (!unsafe) return reload(`${trigger}: ${changes.map(describeChange).join(', ')}`);
        log.info(`not reloading (${unsafe}); showing banner`);
      }
      announce(changes);
    };

    const check = async (trigger: Trigger, awayMs = 0) => {
      if (signal.aborted || inFlight) return;

      if (fingerprintDisabled) {
        // No way to tell what changed: time-based reload on arrival only.
        const limit = cfg.genericReloadAfterSec * 1000;
        if (ARRIVAL.has(trigger) && limit > 0 && awayMs >= limit) {
          act(trigger, [{ field: 'updated', label: 'Activity', from: null, to: null }]);
        }
        return;
      }

      inFlight = true;
      const started = performance.now();
      try {
        const fp = await fetchFingerprint!(signal);
        if (signal.aborted) return;
        if (cfg.titleStatus && fp.ciStatus !== undefined) title.set(fp.ciStatus);
        if (!baseline) {
          baseline = fp;
          log.debug('baseline', fp.fields);
          return;
        }
        const changes = diffFingerprints(baseline, fp);
        log.debug(`check (${trigger}) in ${Math.round(performance.now() - started)}ms`, {
          changes: changes.length,
        });
        if (changes.length) act(trigger, changes);
        else banner.hide();
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          // Not visible to this user (or not an API-able page): fall back to time-based mode.
          log.warn(`fingerprint unavailable (${err.status}); using time-based refresh`);
          fingerprintDisabled = true;
        } else {
          log.debug(`check (${trigger}) failed; will retry on next trigger`, err);
        }
      } finally {
        inFlight = false;
      }
    };

    // --- triggers ---------------------------------------------------------------------------

    const markAway = () => (awaySince ??= Date.now());
    const markBack = () => {
      if (awaySince === undefined) return;
      const away = Date.now() - awaySince;
      awaySince = undefined;
      if (cfg.onFocus && away >= cfg.hiddenThresholdSec * 1000) void check('focus', away);
    };
    const opts = { signal } as const;

    document.addEventListener(
      'visibilitychange',
      () => (document.visibilityState === 'hidden' ? markAway() : markBack()),
      opts,
    );
    // Window switches don't always change visibility (e.g. side-by-side windows).
    window.addEventListener('blur', markAway, opts);
    window.addEventListener('focus', markBack, opts);
    window.addEventListener('online', () => void check('online', Infinity), opts);
    window.addEventListener(
      'pageshow',
      (e) => {
        if (e.persisted) void check('bfcache', Infinity);
      },
      opts,
    );

    if (cfg.poll && cfg.pollIntervalSec > 0 && !fingerprintDisabled) {
      const id = setInterval(() => {
        if (document.visibilityState === 'visible') void check('poll');
      }, cfg.pollIntervalSec * 1000);
      onCleanup(() => clearInterval(id));
    }

    if (document.visibilityState === 'hidden' || !document.hasFocus()) markAway();
    restoreScroll(page.key, signal);
    void check('init');
    log.debug('watching', { kind: page.kind, fingerprint: !fingerprintDisabled });
  },
});
