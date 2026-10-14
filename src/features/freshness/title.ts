/** Keeps a CI-status emoji in front of the tab title, re-applying it if GitLab rewrites the title. */

const ICONS: Record<string, string> = {
  success: '✅',
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
  let prefix = '';
  let observer: MutationObserver | undefined;

  const strip = (t: string) => (prefix && t.startsWith(prefix) ? t.slice(prefix.length) : t);
  const apply = (next: string) => {
    const base = strip(document.title);
    prefix = next;
    const want = prefix + base;
    if (document.title !== want) document.title = want;
  };

  return {
    set(status) {
      const icon = statusIcon(status);
      apply(icon ? `${icon} ` : '');
      if (!observer && document.head) {
        // GitLab sets the title on in-page tab switches; put our prefix back.
        observer = new MutationObserver(() => {
          if (prefix && !document.title.startsWith(prefix)) apply(prefix);
        });
        observer.observe(document.head, { subtree: true, childList: true, characterData: true });
      }
    },
    destroy() {
      observer?.disconnect();
      observer = undefined;
      apply('');
    },
  };
}
