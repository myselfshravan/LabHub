/** Persisted ring buffer of log entries, owned by the background service worker. */
import { storage } from 'wxt/utils/storage';
import type { LogEntry } from './logger';

export const MAX_LOG_ENTRIES = 1000;

export const logsItem = storage.defineItem<LogEntry[]>('local:logs', { fallback: [] });

export function appendBounded<T>(buf: T[], items: T[], max: number): T[] {
  const next = buf.concat(items);
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * Batches appends so a burst of logs from several tabs costs one storage write.
 * The in-memory queue is lost if the worker dies within the flush delay; acceptable for logs.
 */
export function createLogSink(flushMs = 500) {
  let queue: LogEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    timer = undefined;
    const batch = queue;
    queue = [];
    if (batch.length)
      await logsItem.setValue(appendBounded(await logsItem.getValue(), batch, MAX_LOG_ENTRIES));
  };
  return {
    push(entry: LogEntry) {
      queue.push(entry);
      timer ??= setTimeout(() => void flush(), flushMs);
    },
    flush,
  };
}
