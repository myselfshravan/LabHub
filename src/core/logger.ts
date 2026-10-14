/**
 * Namespaced logger. Every entry goes to the console as `[BGL:<ns>]` and to the background
 * service worker, which keeps a persisted ring buffer that the Options page can show/export.
 * Debug-level entries hit the console only when `settings.debug` is on (they are always buffered).
 */
import { browser } from 'wxt/browser';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  ns: string;
  msg: string;
  data?: unknown;
  url?: string;
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(ns: string): Logger;
}

export const LOG_MESSAGE = 'bgl:log';

let consoleDebug = false;
export function setConsoleDebug(on: boolean): void {
  consoleDebug = on;
}

/** Makes `data` structured-clone/JSON safe (Errors lose their fields otherwise). */
function serialize(data: unknown): unknown {
  if (data instanceof Error) return { name: data.name, message: data.message, stack: data.stack };
  try {
    return data === undefined ? undefined : JSON.parse(JSON.stringify(data));
  } catch {
    return String(data);
  }
}

let transport: ((entry: LogEntry) => void) | undefined;
/** Overrides where entries go; the background uses this to write straight to its buffer. */
export function setLogTransport(fn: (entry: LogEntry) => void): void {
  transport = fn;
}

function forward(entry: LogEntry): void {
  if (transport) return transport(entry);
  try {
    // Fire-and-forget; the background may be restarting, which is fine to drop.
    browser.runtime?.sendMessage?.({ type: LOG_MESSAGE, entry })?.catch(() => {});
  } catch {
    /* extension context invalidated (e.g. after an update) */
  }
}

export function createLogger(ns: string): Logger {
  const emit = (level: LogLevel, msg: string, data?: unknown) => {
    const entry: LogEntry = { t: Date.now(), level, ns, msg, data: serialize(data) };
    if (typeof location !== 'undefined') entry.url = location.href;
    if (level !== 'debug' || consoleDebug) {
      const fn = level === 'debug' ? console.debug : console[level];
      fn(`[BGL:${ns}] ${msg}`, ...(data === undefined ? [] : [data]));
    }
    forward(entry);
  };
  return {
    debug: (m, d) => emit('debug', m, d),
    info: (m, d) => emit('info', m, d),
    warn: (m, d) => emit('warn', m, d),
    error: (m, d) => emit('error', m, d),
    child: (sub) => createLogger(`${ns}:${sub}`),
  };
}
