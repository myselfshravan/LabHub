/**
 * Self-hosted GitLab support. gitlab.com is a static manifest match; any other origin the user
 * grants (optional host permission) gets the same content script registered at runtime.
 * Granted permissions are the single source of truth for which hosts are enabled.
 */
import { browser } from 'wxt/browser';

export const BUILTIN_ORIGIN_PATTERN = 'https://gitlab.com/*';
const SCRIPT_ID = 'bgl-self-hosted';
const CONTENT_JS = 'content-scripts/content.js';

export const originPattern = (origin: string) => `${new URL(origin).origin}/*`;

/** Origins (as `https://host/*` patterns) the user enabled, excluding gitlab.com. */
export async function enabledHostPatterns(): Promise<string[]> {
  const { origins = [] } = await browser.permissions.getAll();
  return origins.filter((o) => o !== BUILTIN_ORIGIN_PATTERN);
}

/** Must be called from a user gesture (popup/options click). */
export async function requestHost(origin: string): Promise<boolean> {
  return browser.permissions.request({ origins: [originPattern(origin)] });
}

export async function removeHost(pattern: string): Promise<boolean> {
  return browser.permissions.remove({ origins: [pattern] });
}

/** Makes the registered content scripts match the granted hosts. Idempotent. */
export async function syncRegisteredHosts(): Promise<string[]> {
  const patterns = await enabledHostPatterns();
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (patterns.length) {
    await browser.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches: patterns,
        js: [CONTENT_JS],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  }
  return patterns;
}

/** Injects into already-open tabs of a newly granted host so the user doesn't need to reload. */
export async function injectIntoOpenTabs(patterns: string[]): Promise<void> {
  const tabs = await browser.tabs.query({ url: patterns });
  await Promise.allSettled(
    tabs
      .filter((t) => t.id !== undefined)
      .map((t) =>
        browser.scripting.executeScript({
          target: { tabId: t.id! },
          files: [`/${CONTENT_JS}` as const],
        }),
      ),
  );
}
