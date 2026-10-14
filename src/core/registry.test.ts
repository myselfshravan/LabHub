import { describe, expect, it, vi } from 'vitest';
import type { GitLabApi } from './api';
import { defineFeature } from './feature';
import type { Logger } from './logger';
import { parsePage } from './page';
import { createRegistry } from './registry';
import { DEFAULT_SETTINGS, mergeDefaults, type Settings } from './settings';

const log: Logger = { debug() {}, info() {}, warn() {}, error: vi.fn(), child: () => log };
const api = {} as GitLabApi;
const page = (path: string) => parsePage(new URL(`https://gitlab.com${path}`), null);
const settings = (patch: unknown = {}): Settings => mergeDefaults(DEFAULT_SETTINGS, patch);

describe('registry', () => {
  it('starts matching features, stops them on navigation, and isolates failures', async () => {
    const cleanup = vi.fn();
    const mrOnly = defineFeature({
      id: 'mr-only',
      title: '',
      description: '',
      defaultOn: true,
      matches: (p) => p.kind === 'mr',
      css: '.x{}',
      init: () => cleanup,
    });
    const broken = defineFeature({
      id: 'broken',
      title: '',
      description: '',
      defaultOn: true,
      init: () => {
        throw new Error('boom');
      },
    });
    const reg = createRegistry([broken, mrOnly], api, log);

    reg.sync(page('/o/r/-/merge_requests/1'), settings());
    await Promise.resolve();
    expect(reg.running()).toEqual(['broken', 'mr-only']);
    expect(document.querySelector('style[data-bgl="mr-only"]')).not.toBeNull();
    expect(log.error).toHaveBeenCalled();

    reg.sync(page('/o/r/-/issues/1'), settings());
    expect(cleanup).toHaveBeenCalledOnce();
    expect(reg.running()).toEqual(['broken']);
    expect(document.querySelector('style[data-bgl="mr-only"]')).toBeNull();
  });

  it('respects master switch and per-feature toggles', () => {
    const f = defineFeature({ id: 'f', title: '', description: '', defaultOn: false, init() {} });
    const reg = createRegistry([f], api, log);
    reg.sync(page('/'), settings());
    expect(reg.running()).toEqual([]);
    reg.sync(page('/'), settings({ features: { f: true } }));
    expect(reg.running()).toEqual(['f']);
    reg.sync(page('/'), settings({ enabled: false, features: { f: true } }));
    expect(reg.running()).toEqual([]);
  });

  it('restarts only when the feature settings slice changes', () => {
    const init = vi.fn();
    const f = defineFeature({
      id: 'f',
      title: '',
      description: '',
      defaultOn: true,
      settingsKey: (s) => s.freshness.pollIntervalSec,
      init,
    });
    const reg = createRegistry([f], api, log);
    reg.sync(page('/'), settings());
    reg.sync(page('/'), settings({ debug: true }));
    expect(init).toHaveBeenCalledTimes(1);
    reg.sync(page('/'), settings({ freshness: { pollIntervalSec: 5 } }));
    expect(init).toHaveBeenCalledTimes(2);
  });
});
