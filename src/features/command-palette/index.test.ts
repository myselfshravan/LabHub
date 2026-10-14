import { describe, expect, it, vi } from 'vitest';
import type { FeatureContext } from '@/core/feature';
import feature from './index';

const press = (target: EventTarget, init: KeyboardEventInit) => {
  const e = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

describe('command-palette', () => {
  it('clicks GitLab search on ⌘K / Ctrl+K but not inside editors', () => {
    document.body.innerHTML =
      '<button data-testid="super-topbar-search-button"></button><textarea></textarea>';
    const click = vi.fn();
    document.querySelector('button')!.addEventListener('click', click);
    const abort = new AbortController();
    const log = { warn: vi.fn() };
    feature.init({ signal: abort.signal, log } as unknown as FeatureContext);

    expect(press(document.body, { metaKey: true }).defaultPrevented).toBe(true);
    press(document.body, { ctrlKey: true });
    expect(click).toHaveBeenCalledTimes(2);

    press(document.querySelector('textarea')!, { metaKey: true });
    press(document.body, { metaKey: true, shiftKey: true });
    expect(click).toHaveBeenCalledTimes(2);

    abort.abort();
    press(document.body, { metaKey: true });
    expect(click).toHaveBeenCalledTimes(2);
  });
});
