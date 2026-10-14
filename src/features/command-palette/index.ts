/**
 * GitHub's ⌘K / Ctrl+K: opens GitLab's own "Search or go to…" palette (which already supports
 * `>` commands, `@` users and `:` projects). Skipped inside editors, where GitLab uses ⌘K for
 * "insert link".
 */
import { defineFeature } from '@/core/feature';
import { SEL } from '@/core/selectors';

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'INPUT' ||
    el.tagName === 'SELECT'
  );
}

export default defineFeature({
  id: 'command-palette',
  title: '⌘K / Ctrl+K search',
  description: 'Open "Search or go to…" with the GitHub shortcut.',
  defaultOn: true,
  init({ signal, log }) {
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey)
          return;
        if (isEditable(e.target)) return;
        const btn = document.querySelector<HTMLElement>(SEL.searchButton);
        if (!btn) return log.warn('search button not found; selector may be outdated');
        e.preventDefault();
        e.stopPropagation();
        btn.click();
      },
      { capture: true, signal },
    );
  },
});
