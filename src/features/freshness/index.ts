/**
 * Freshness: GitLab pages go stale (MR status, pipelines, approvals, lists) because most of the
 * page is server-rendered once and polling is partial. We take an API fingerprint of what the
 * page shows, re-check it on the triggers below, and when it differs refresh the page in the
 * background ("auto" mode) — or, in "banner" mode, show an "updates" banner instead.
 *
 * Triggers:
 *  - return to the tab (visibility/focus) after being away ≥ hiddenThresholdSec
 *  - back/forward-cache restore and network coming back online
 *  - polling while visible, and a slower check while the tab is hidden
 *  - first mouse/keyboard activity after the visible tab sat idle → treated like returning
 *
 * Background refresh: a hidden tab reloads as soon as it's found stale, so it's already fresh
 * when you come back. A visible tab reloads once you've been hands-off for QUIET_MS (scroll is
 * restored). Nothing reloads while it would lose something (typed text, open dialog, text
 * selection); then the banner is the fallback until it's safe.
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

type Trigger = 'init' | 'focus' | 'poll' | 'online' | 'bfcache' | 'hidden';
type AwayReason = 'hidden' | 'blur' | 'idle';

/** Triggers where the user is (re)arriving, so a reload isn't disruptive. */
const ARRIVAL: ReadonlySet<Trigger> = new Set(['focus', 'online', 'bfcache']);

/** Pages GitLab keeps current by itself while visible: no banner/reload, title status only. */
const LIVE_PAGES: ReadonlySet<PageKind> = new Set(['pipeline', 'pipeline-list', 'job']);

/** Pages with a CI status for the tab title. */
const CI_PAGES: ReadonlySet<PageKind> = new Set(['mr', 'pipeline', 'job']);

/** Check rate for hidden tabs (one small request per tab). */
const HIDDEN_INTERVAL_MS = 60_000;

/** A visible page only refreshes after this long without mouse/keyboard input. */
const QUIET_MS = 8_000;

/** How often a pending background refresh re-checks whether it may go ahead. */
const PENDING_RETRY_MS = 2_000;

/** Longest pause between background checks after repeated failures. */
const MAX_BACKOFF_MS = 10 * 60_000;

/** Background triggers that should respect idle/offline/backoff (arrivals always check). */
const BACKGROUND: ReadonlySet<Trigger> = new Set(['poll', 'hidden']);

export default defineFeature({
  id: 'freshness',
  title: 'Keep pages fresh',
  description:
    'Detects when MR/issue/list pages are out of date and refreshes them in the background, without losing anything you are typing.',
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
    /** Changes found but not yet applied because reloading right now would be disruptive. */
    let pending: Change[] | undefined;
    let pendingTimer: ReturnType<typeof setInterval> | undefined;
    onCleanup(() => clearInterval(pendingTimer));

    /** Set once a reload is requested: nothing else should act on this document any more. */
    let reloading = false;
    const reload = (why: string) => {
      if (reloading) return;
      reloading = true;
      clearInterval(pendingTimer);
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

    /**
     * Background refresh: go ahead when nothing would be lost and the user isn't mid-look —
     * hidden tab, just arrived, or hands-off for QUIET_MS. Returns whether it reloaded.
     */
    const tryRefresh = (trigger: Trigger | 'pending', changes: Change[]): boolean => {
      const unsafe = unsafeReason();
      if (unsafe) {
        if (pending === undefined) log.info(`not refreshing yet (${unsafe}); showing banner`);
        announce(changes);
        return false;
      }
      const hidden = document.visibilityState === 'hidden';
      const quiet = Date.now() - lastActivity >= QUIET_MS;
      if (!hidden && !quiet && !ARRIVAL.has(trigger as Trigger)) return false;
      reload(`${trigger}: ${changes.map(describeChange).join(', ')}`);
      return true;
    };

    /** Refresh in the background when allowed; otherwise wait for a safe, quiet moment. */
    const act = (trigger: Trigger, changes: Change[]) => {
      if (cfg.mode !== 'auto') return announce(changes);
      if (tryRefresh(trigger, changes)) return;
      pending = changes;
      if (pendingTimer !== undefined) return;
      log.debug('refresh pending until the page is safe and quiet');
      pendingTimer = setInterval(() => {
        if (pending && !signal.aborted) tryRefresh('pending', pending);
      }, PENDING_RETRY_MS);
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
      if (signal.aborted || inFlight || reloading) return;
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
        if (live) return;
        if (!baseline) {
          baseline = fp;
          log.debug('baseline', fp.fields);
          return;
        }
        const changes = diffFingerprints(baseline, fp);
        // Fields the baseline never saw (a best-effort request failed at load) start from now,
        // so they're compared from the next check on instead of never.
        baseline = { ...baseline, fields: { ...fp.fields, ...baseline.fields } };
        log.debug(`check (${trigger}) in ${Math.round(performance.now() - started)}ms`, {
          changes: changes.length,
        });
        if (changes.length) act(trigger, changes);
        else {
          pending = undefined;
          banner.hide();
        }
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

    // Input tracking (for "quiet" refreshes) and idle: a visible tab nobody has touched.
    const inputEvents = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];
    if (cfg.idleAfterSec <= 0) {
      const touch = () => (lastActivity = Date.now());
      for (const ev of inputEvents) {
        window.addEventListener(ev, touch, { ...opts, passive: true, capture: true });
      }
    } else {
      const idleMs = cfg.idleAfterSec * 1000;
      const onActivity = () => {
        lastActivity = Date.now();
        if (!idle) return;
        idle = false;
        log.debug('active again');
        markBack('activity');
      };
      for (const ev of inputEvents) {
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

    // Hidden tabs: background refresh (auto mode), plus the title status and "CI finished"
    // notification on CI pages.
    const hiddenUseful = live
      ? (cfg.titleStatus || cfg.notify) && CI_PAGES.has(page.kind)
      : cfg.mode === 'auto' || ((cfg.titleStatus || cfg.notify) && CI_PAGES.has(page.kind));
    if (hiddenUseful && !fingerprintDisabled) {
      const id = setInterval(() => {
        if (document.visibilityState === 'hidden') void check('hidden');
      }, HIDDEN_INTERVAL_MS);
      onCleanup(() => clearInterval(id));
    }

    if (document.visibilityState === 'hidden') markAway('hidden');
    else if (!document.hasFocus()) markAway('blur');
    restoreScroll(page.key, signal);
    void check('init');
    log.debug('watching', { kind: page.kind, fingerprint: !fingerprintDisabled });
  },
});
