/**
 * Content script entry: detects the GitLab page, then lets the registry run the enabled
 * features, re-syncing on in-page navigation and settings changes.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createApi } from '@/core/api';
import { createLogger, setConsoleDebug } from '@/core/logger';
import { isGitLabDocument, parsePage } from '@/core/page';
import { createRegistry } from '@/core/registry';
import { getSettings, watchSettings } from '@/core/settings';
import { FEATURES } from '@/features';

export default defineContentScript({
  matches: ['https://gitlab.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    const root = document.documentElement;
    // Self-hosted tabs can receive both the registered script and a one-off injection.
    if (root.dataset.bglLoaded || !isGitLabDocument(document)) return;
    root.dataset.bglLoaded = 'true';

    const log = createLogger('core');
    let settings = await getSettings();
    setConsoleDebug(settings.debug);

    const registry = createRegistry(FEATURES, createApi(location.origin), log);
    const page = () => parsePage(new URL(location.href), document.body);
    const sync = () => registry.sync(page(), settings);

    sync();
    log.debug('loaded', {
      page: page().kind,
      dataPage: page().dataPage,
      running: registry.running(),
    });

    // wxt:locationchange fires from the Navigation API's `navigate` event, before the new URL
    // commits, so `location.href` there is still the previous page. `currententrychange` fires
    // after the commit, for same-document navigations only (pushState, replaceState, back/forward).
    if (typeof navigation !== 'undefined') {
      ctx.addEventListener(navigation, 'currententrychange', sync);
    } else {
      ctx.addEventListener(window, 'wxt:locationchange', sync);
    }
    const unwatch = watchSettings((s) => {
      settings = s;
      setConsoleDebug(s.debug);
      sync();
    });
    ctx.onInvalidated(() => {
      unwatch();
      registry.stopAll();
      delete root.dataset.bglLoaded;
    });
  },
});
