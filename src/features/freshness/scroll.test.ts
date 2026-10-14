import { afterEach, describe, expect, it } from 'vitest';
import { scroller } from './scroll';

afterEach(() => (document.body.innerHTML = ''));

describe('scroller', () => {
  it("prefers GitLab's scrolling content panel", () => {
    document.body.innerHTML = '<div class="js-static-panel-inner"></div>';
    const panel = document.querySelector('div')!;
    Object.defineProperty(panel, 'scrollHeight', { value: 2000 });
    Object.defineProperty(panel, 'clientHeight', { value: 700 });
    expect(scroller()).toBe(panel);
  });

  it('falls back to the page when the panel does not scroll', () => {
    document.body.innerHTML = '<div class="js-static-panel-inner"></div>';
    expect(scroller()).toBe(document.scrollingElement ?? document.documentElement);
  });
});
