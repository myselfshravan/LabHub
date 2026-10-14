import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isFeatureOn, mergeDefaults } from './settings';

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
