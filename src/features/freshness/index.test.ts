import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitLabApi } from '@/core/api';
import type { Logger } from '@/core/logger';
import { parsePage } from '@/core/page';
import { DEFAULT_SETTINGS } from '@/core/settings';
import freshness from './index';

const log: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => log,
};

/** An MR whose `sha` the test can change to make the page stale. */
function start() {
  const mr = {
    state: 'opened',
    sha: 'a',
    user_notes_count: 0,
    has_conflicts: false,
    updated_at: 't',
  };
  const api = {
    get: vi.fn(async (path: string) =>
      path.endsWith('/approvals') ? { approved_by: [] } : { ...mr },
    ),
    getPageJson: vi.fn(),
    total: vi.fn(),
    project: (p: string) => `projects/${encodeURIComponent(p)}`,
    group: (p: string) => `groups/${encodeURIComponent(p)}`,
  } as unknown as GitLabApi;
  const abort = new AbortController();
  const cleanups: Array<() => void> = [];
  void freshness.init({
    page: parsePage(new URL('https://gitlab.com/o/r/-/merge_requests/5'), null),
    settings: DEFAULT_SETTINGS,
    api,
    log,
    signal: abort.signal,
    onCleanup: (fn) => cleanups.push(fn),
  });
  return {
    mr,
    stop: () => {
      abort.abort();
      cleanups.forEach((fn) => fn());
    },
  };
}

let visibility: DocumentVisibilityState = 'visible';
const reload = vi.fn();
const banner = () => document.querySelector('[data-bgl="freshness-banner"]');
/** Lets the fingerprint promises settle while fake timers hold the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload } as Location);
  reload.mockClear();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('background refresh', () => {
  it('reloads a hidden tab as soon as it is stale', async () => {
    const t = start();
    await flush(); // baseline
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    t.mr.sha = 'b';
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledOnce();
    expect(banner()).toBeNull();
    t.stop();
  });

  it('waits for the user to pause before refreshing the visible tab', async () => {
    const t = start();
    await flush();
    t.mr.sha = 'b';
    // Keep "using" the page right up to the poll.
    for (let i = 0; i < 30; i++) {
      window.dispatchEvent(new Event('pointermove'));
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(reload).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
    // Hands off for a few seconds: refreshes quietly.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reload).toHaveBeenCalledOnce();
    t.stop();
  });

  it('never reloads over typed text; shows the banner instead', async () => {
    const t = start();
    await flush();
    const box = document.createElement('textarea');
    box.value = 'half-written comment';
    document.body.append(box);
    t.mr.sha = 'b';
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).not.toHaveBeenCalled();
    expect(banner()).not.toBeNull();
    // Comment sent (box cleared): the pending refresh goes ahead.
    box.value = '';
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reload).toHaveBeenCalledOnce();
    t.stop();
  });
});
