/** CI-status emoji in front of the tab title (composed by core/title). */
import { tabTitle } from '@/core/title';

const ICONS: Record<string, string> = {
  success: '✅',
  'success-with-warnings': '⚠️',
  failed: '❌',
  running: '🔄',
  pending: '⏳',
  created: '⏳',
  preparing: '⏳',
  waiting_for_resource: '⏳',
  waiting_for_callback: '⏳',
  scheduled: '🕒',
  manual: '▶️',
  canceled: '🚫',
  canceling: '🚫',
  skipped: '⏭️',
};

export function statusIcon(status: string | null | undefined): string {
  return status ? (ICONS[status] ?? '') : '';
}

export interface TitleStatus {
  set(status: string | null | undefined): void;
  destroy(): void;
}

export function createTitleStatus(): TitleStatus {
  return {
    set(status) {
      const icon = statusIcon(status);
      tabTitle.setPrefix(icon ? `${icon} ` : '');
    },
    destroy: () => tabTitle.setPrefix(''),
  };
}
