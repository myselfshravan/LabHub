/**
 * Desktop notifications for things you'd otherwise only learn by going back to a stale tab:
 * a pipeline finishing, an MR getting merged/closed, a new approval. Only fired while you're
 * not looking at the tab; the background owns the actual chrome.notifications call.
 */
import { browser } from 'wxt/browser';
import type { Fingerprint } from './fingerprint';
import { statusIcon } from './title';

export const NOTIFY_MESSAGE = 'bgl:notify';

export interface NotifyMessage {
  type: typeof NOTIFY_MESSAGE;
  title: string;
  message: string;
}

/** CI statuses that mean "still going". */
const ACTIVE = new Set([
  'created',
  'pending',
  'preparing',
  'running',
  'scheduled',
  'waiting_for_resource',
  'waiting_for_callback',
]);

const FINISHED: Record<string, string> = {
  success: 'passed',
  'success-with-warnings': 'passed with warnings',
  failed: 'failed',
  canceled: 'was canceled',
  manual: 'is waiting for a manual action',
};

/** What's worth interrupting for between two consecutive fingerprints, if anything. */
export function notableChange(
  prev: Fingerprint,
  next: Fingerprint,
  subject: 'Pipeline' | 'Job' = 'Pipeline',
): string | undefined {
  const from = prev.ciStatus;
  const to = next.ciStatus;
  // Same pipeline only: a new push restarting CI isn't news, its result is.
  const samePipeline = prev.fields.pipelineId === next.fields.pipelineId;
  if (from && to && from !== to && ACTIVE.has(from) && FINISHED[to] && samePipeline) {
    return `${statusIcon(to)} ${subject} ${FINISHED[to]}`;
  }

  const state = next.fields.state;
  if (prev.fields.state === 'opened' && (state === 'merged' || state === 'closed')) {
    return state === 'merged' ? '🟣 Merged' : '🚫 Closed';
  }

  const before = new Set(
    String(prev.fields.approvals ?? '')
      .split(',')
      .filter(Boolean),
  );
  const added = String(next.fields.approvals ?? '')
    .split(',')
    .filter((id) => id && !before.has(id));
  if (prev.fields.approvals != null && added.length) return '👍 New approval';
  return undefined;
}

/** True when the user isn't looking at this tab (hidden, or another window has focus). */
export function userNotLooking(): boolean {
  return document.visibilityState === 'hidden' || !document.hasFocus();
}

export function sendNotification(title: string, message: string): void {
  try {
    const msg: NotifyMessage = { type: NOTIFY_MESSAGE, title, message };
    browser.runtime?.sendMessage?.(msg)?.catch(() => {});
  } catch {
    /* extension context invalidated (e.g. after an update) */
  }
}
