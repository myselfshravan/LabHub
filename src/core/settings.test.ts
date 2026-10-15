import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  DEFAULT_SETTINGS,
  getSettings,
  isFeatureOn,
  mergeDefaults,
  updateSettings,
} from './settings';

describe('updateSettings', () => {
  beforeEach(() => fakeBrowser.reset());

  it('stores only the user’s values, so later default changes still apply', async () => {
    await updateSettings({ freshness: { mode: 'banner' } });
    await updateSettings({ features: { 'tab-titles': false } });
    expect(await storage.getItem('sync:settings')).toEqual({
      freshness: { mode: 'banner' },
      features: { 'tab-titles': false },
    });
    const s = await getSettings();
    expect(s.freshness.mode).toBe('banner');
    expect(s.freshness.pollIntervalSec).toBe(DEFAULT_SETTINGS.freshness.pollIntervalSec);
  });

  it('returns the full settings and keeps earlier overrides', async () => {
    await updateSettings({ freshness: { poll: false } });
    const s = await updateSettings({ freshness: { notify: false } });
    expect(s.freshness).toMatchObject({ poll: false, notify: false, mode: 'auto' });
  });
});

describe('settings', () => {
  it('fills missing nested keys from defaults', () => {
    const s = mergeDefaults(DEFAULT_SETTINGS, {
      freshness: { poll: false },
      features: { x: false },
    });
    expect(s.freshness.poll).toBe(false);
    expect(s.freshness.pollIntervalSec).toBe(DEFAULT_SETTINGS.freshness.pollIntervalSec);
    expect(s.features).toEqual({ x: false });
    expect(s.enabled).toBe(true);
  });

  it('treats null/undefined stored values as defaults', () => {
    expect(mergeDefaults(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS);
  });

  it('feature toggle falls back to defaultOn and obeys master switch', () => {
    const s = mergeDefaults(DEFAULT_SETTINGS, { features: { a: false } });
    expect(isFeatureOn(s, 'a', true)).toBe(false);
    expect(isFeatureOn(s, 'b', true)).toBe(true);
    expect(isFeatureOn({ ...s, enabled: false }, 'b', true)).toBe(false);
  });
});
