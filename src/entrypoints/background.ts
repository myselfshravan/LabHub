/** Service worker: owns the log buffer and keeps self-hosted content scripts registered. */
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { injectIntoOpenTabs, syncRegisteredHosts } from '@/core/hosts';
import { createLogSink } from '@/core/log-store';
import { createLogger, LOG_MESSAGE, setLogTransport, type LogEntry } from '@/core/logger';

export default defineBackground(() => {
  const sink = createLogSink();
  setLogTransport(sink.push);
  const log = createLogger('bg');

  browser.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as { type?: string; entry?: LogEntry };
    if (m?.type === LOG_MESSAGE && m.entry) sink.push(m.entry);
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
