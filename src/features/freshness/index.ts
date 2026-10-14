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
 *  - first mouse/keyboard activity after the visible tab sat idle → treated like returning
 *
 * Polling pauses while idle or offline and backs off on errors, so a forgotten tab on a second
 * monitor doesn't hit the API all night. CI finishing / MR merged or approved while you're not
 * looking raises a desktop notification.
 *
 * Pages without a fingerprint (code, settings, ...) simply reload when returned to after
 * genericReloadAfterSec, under the same safety rules.
 *
 * Pipeline and job pages are live already (GitLab polls them while visible), so there we only
 * keep the tab-title CI status current — including while the tab is hidden, which is when the
 * title is actually useful.
 */
import { ApiError } from '@/core/api';
import { defineFeature } from '@/core/feature';
import { tabTitle } from '@/core/title';
import type { PageKind } from '@/core/page';
import { createBanner } from './banner';
import {
  describeChange,
  diffFingerprints,
  fetcherFor,
  type Change,
  type Fingerprint,
} from './fingerprint';
import { notableChange, sendNotification, userNotLooking } from './notify';
import { unsafeReason } from './safety';
import { restoreScroll, saveScroll } from './scroll';
import { createTitleStatus } from './title';

type Trigger = 'init' | 'focus' | 'poll' | 'online' | 'bfcache' | 'title';
type AwayReason = 'hidden' | 'blur' | 'idle';

/** Triggers where the user is (re)arriving, so a reload isn't disruptive. */
const ARRIVAL: ReadonlySet<Trigger> = new Set(['focus', 'online', 'bfcache']);

/** Pages GitLab keeps current by itself while visible: no banner/reload, title status only. */
const LIVE_PAGES: ReadonlySet<PageKind> = new Set(['pipeline', 'pipeline-list', 'job']);

/** Pages with a CI status for the tab title. */
const CI_PAGES: ReadonlySet<PageKind> = new Set(['mr', 'pipeline', 'job']);

/** Title-only refresh rate for hidden tabs (one small request per tab). */
const HIDDEN_TITLE_INTERVAL_MS = 60_000;

/** Longest pause between background checks after repeated failures. */
const MAX_BACKOFF_MS = 10 * 60_000;

/** Background triggers that should respect idle/offline/backoff (arrivals always check). */
const BACKGROUND: ReadonlySet<Trigger> = new Set(['poll', 'title']);

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
    const live = LIVE_PAGES.has(page.kind);
    const title = createTitleStatus();
    onCleanup(() => title.destroy());

    let baseline: Fingerprint | undefined;
    let fingerprintDisabled = !fetchFingerprint;
    let inFlight = false;
    let awaySince: number | undefined;
    let awayReason: AwayReason | undefined;
    let idle = false;
    let lastActivity = Date.now();
    let failures = 0;
    let retryAt = 0;
    /** Previous successful fingerprint, for once-per-transition notifications. */
    let previous: Fingerprint | undefined;
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

    const notify = (fp: Fingerprint) => {
      const prev = previous;
      previous = fp;
      if (!cfg.notify || !prev || !userNotLooking()) return;
      const what = notableChange(prev, fp, page.kind === 'job' ? 'Job' : 'Pipeline');
      if (!what) return;
      log.info(`notifying: ${what}`);
      sendNotification(what, tabTitle.text());
    };

    const check = async (trigger: Trigger, awayMs = 0) => {
      if (signal.aborted || inFlight) return;
      if (BACKGROUND.has(trigger) && (!navigator.onLine || Date.now() < retryAt)) return;

      if (fingerprintDisabled) {
        if (live) return;
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
        failures = 0;
        retryAt = 0;
        if (cfg.titleStatus && fp.ciStatus !== undefined) title.set(fp.ciStatus);
        notify(fp);
        if (live || trigger === 'title') return;
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
          // Not visible to this user (or not an API-able page): an expected condition, so info,
          // not warn — warn/error surface on chrome://extensions as extension errors.
          log.info(`fingerprint unavailable (${err.status}); using time-based refresh`);
          fingerprintDisabled = true;
        } else {
          // Rate limits, 5xx, network: back off background checks exponentially.
          failures++;
          const base = (BACKGROUND.has(trigger) ? cfg.pollIntervalSec : 30) * 1000;
          const wait = Math.min(base * 2 ** (failures - 1), MAX_BACKOFF_MS);
          retryAt = Date.now() + wait;
          log.debug(`check (${trigger}) failed; backing off ${Math.round(wait / 1000)}s`, err);
        }
      } finally {
        inFlight = false;
      }
    };

    // --- triggers ---------------------------------------------------------------------------

    const markAway = (reason: AwayReason) => {
      if (awaySince !== undefined) return;
      awaySince = Date.now();
      awayReason = reason;
    };
    /** `activity` only ends an idle spell: hovering a side-by-side window isn't returning. */
    const markBack = (via: 'focus' | 'activity') => {
      if (awaySince === undefined) return;
      if (via === 'activity' && awayReason !== 'idle') return;
      const away = Date.now() - awaySince;
      awaySince = awayReason = undefined;
      if (cfg.onFocus && away >= cfg.hiddenThresholdSec * 1000) void check('focus', away);
    };
    const opts = { signal } as const;

    document.addEventListener(
      'visibilitychange',
      () => (document.visibilityState === 'hidden' ? markAway('hidden') : markBack('focus')),
      opts,
    );
    // Window switches don't always change visibility (e.g. side-by-side windows).
    window.addEventListener('blur', () => markAway('blur'), opts);
    window.addEventListener('focus', () => markBack('focus'), opts);

    // Idle: a visible tab nobody has touched for a while.
    if (cfg.idleAfterSec > 0) {
      const idleMs = cfg.idleAfterSec * 1000;
      const onActivity = () => {
        lastActivity = Date.now();
        if (!idle) return;
        idle = false;
        log.debug('active again');
        markBack('activity');
      };
      for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
        window.addEventListener(ev, onActivity, { ...opts, passive: true, capture: true });
      }
      const id = setInterval(
        () => {
          if (idle || document.visibilityState !== 'visible') return;
          if (Date.now() - lastActivity < idleMs) return;
          idle = true;
          log.debug('idle; pausing polling');
          // Away since the last activity, not since we noticed.
          markAway('idle');
          awaySince = Math.min(awaySince ?? Infinity, lastActivity);
        },
        Math.min(idleMs, 15_000),
      );
      onCleanup(() => clearInterval(id));
    }
    window.addEventListener('online', () => void check('online', Infinity), opts);
    window.addEventListener(
      'pageshow',
      (e) => {
        if (e.persisted) void check('bfcache', Infinity);
      },
      opts,
    );

    if (cfg.poll && cfg.pollIntervalSec > 0 && !fingerprintDisabled && !live) {
      const id = setInterval(() => {
        if (document.visibilityState === 'visible' && !idle) void check('poll');
      }, cfg.pollIntervalSec * 1000);
      onCleanup(() => clearInterval(id));
    }

    if (cfg.titleStatus && CI_PAGES.has(page.kind) && !fingerprintDisabled) {
      const id = setInterval(() => {
        if (document.visibilityState === 'hidden') void check('title');
      }, HIDDEN_TITLE_INTERVAL_MS);
      onCleanup(() => clearInterval(id));
    }

    if (document.visibilityState === 'hidden') markAway('hidden');
    else if (!document.hasFocus()) markAway('blur');
    restoreScroll(page.key, signal);
    void check('init');
    log.debug('watching', { kind: page.kind, fingerprint: !fingerprintDisabled });
  },
});
