/**
 * Preserves scroll across our own reloads. The browser's native restoration often fails on
 * GitLab because content renders asynchronously, so we keep retrying until the page is tall
 * enough (or we give up). GitLab's paneled layout scrolls an inner panel, not the window.
 */
import { SEL } from '@/core/selectors';

const KEY = 'bgl:freshness:scroll';
const MAX_AGE_MS = 30_000;

/** The element that actually scrolls: GitLab's content panel when present, else the page. */
export function scroller(doc: Document = document): Element {
  const panel = doc.querySelector(SEL.scrollPanel);
  if (panel && panel.scrollHeight > panel.clientHeight) return panel;
  return doc.scrollingElement ?? doc.documentElement;
}

export function saveScroll(pageKey: string): void {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ pageKey, y: scroller().scrollTop, t: Date.now() }),
    );
  } catch {
    /* storage blocked */
  }
}

export function restoreScroll(pageKey: string, signal: AbortSignal): void {
  let saved: { pageKey: string; y: number; t: number } | undefined;
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    saved = raw ? JSON.parse(raw) : undefined;
  } catch {
    return;
  }
  if (!saved || saved.pageKey !== pageKey || Date.now() - saved.t > MAX_AGE_MS || saved.y <= 0) {
    return;
  }
  const y = saved.y;
  const deadline = Date.now() + 8000;
  // The user taking over scrolling wins over our restoration.
  let userScrolled = false;
  const stop = () => (userScrolled = true);
  for (const ev of ['wheel', 'touchmove', 'keydown', 'mousedown']) {
    window.addEventListener(ev, stop, { once: true, passive: true, signal });
  }
  const attempt = () => {
    if (signal.aborted || userScrolled) return;
    const el = scroller();
    const reachable = el.scrollHeight - el.clientHeight >= y;
    if (reachable) el.scrollTop = y;
    else if (Date.now() < deadline) setTimeout(attempt, 150);
  };
  attempt();
}
