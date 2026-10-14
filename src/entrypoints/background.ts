/**
 * Service worker: owns the log buffer, shows desktop notifications for tabs, and keeps
 * self-hosted content scripts registered.
 */
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { injectIntoOpenTabs, syncRegisteredHosts } from '@/core/hosts';
import { createLogSink } from '@/core/log-store';
import { createLogger, LOG_MESSAGE, setLogTransport, type LogEntry } from '@/core/logger';
import { NOTIFY_MESSAGE, type NotifyMessage } from '@/features/freshness/notify';

/** Notification ids carry the tab they came from, so a click can jump back to it. */
const NOTIFICATION_PREFIX = 'bgl-tab:';

export default defineBackground(() => {
  const sink = createLogSink();
  setLogTransport(sink.push);
  const log = createLogger('bg');

  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    const m = msg as { type?: string; entry?: LogEntry };
    if (m?.type === LOG_MESSAGE && m.entry) sink.push(m.entry);
    if (m?.type === NOTIFY_MESSAGE && sender.tab?.id !== undefined) {
      const n = msg as NotifyMessage;
      browser.notifications
        .create(`${NOTIFICATION_PREFIX}${sender.tab.id}`, {
          type: 'basic',
          iconUrl: browser.runtime.getURL('/icon/128.png'),
          title: n.title,
          message: n.message,
        })
        .catch((err) => log.info('notification failed', err));
    }
  });

  browser.notifications.onClicked.addListener(async (id) => {
    if (!id.startsWith(NOTIFICATION_PREFIX)) return;
    void browser.notifications.clear(id);
    try {
      const tab = await browser.tabs.update(Number(id.slice(NOTIFICATION_PREFIX.length)), {
        active: true,
      });
      if (tab?.windowId !== undefined)
        await browser.windows.update(tab.windowId, { focused: true });
    } catch {
      /* tab was closed since */
    }
  });

  const resync = (why: string) =>
    syncRegisteredHosts()
      .then((patterns) => {
        log.info(`hosts synced (${why})`, patterns);
        return patterns;
      })
      .catch((err) => {
        log.error('host sync failed', err);
        return [];
      });

  browser.runtime.onInstalled.addListener(() => void resync('installed'));
  browser.runtime.onStartup.addListener(() => void resync('startup'));
  browser.permissions.onAdded.addListener(async ({ origins = [] }) => {
    await resync('permission added');
    await injectIntoOpenTabs(origins);
  });
  browser.permissions.onRemoved.addListener(() => void resync('permission removed'));
});
