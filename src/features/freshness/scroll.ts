/**
 * Preserves scroll across our own reloads. The browser's native restoration often fails on
 * GitLab because content renders asynchronously, so we keep retrying until the page is tall
 * enough (or we give up).
 */

const KEY = 'bgl:freshness:scroll';
const MAX_AGE_MS = 30_000;

export function saveScroll(pageKey: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ pageKey, y: window.scrollY, t: Date.now() }));
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
    const reachable = document.documentElement.scrollHeight - window.innerHeight >= y;
    if (reachable) window.scrollTo({ top: y });
    else if (Date.now() < deadline) setTimeout(attempt, 150);
  };
  attempt();
}
