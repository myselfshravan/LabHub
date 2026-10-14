/**
 * GitHub-style "this page has updates" pill. Rendered in a shadow root so GitLab's CSS can't
 * restyle it and ours can't leak.
 */

const CSS = `
:host { all: initial; }
.bar {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483000;
  display: flex; align-items: center; gap: 12px; max-width: min(640px, calc(100vw - 32px));
  padding: 8px 8px 8px 16px; border-radius: 999px;
  font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  color: #fff; background: #0969da; box-shadow: 0 8px 24px rgba(31, 35, 40, .25);
  animation: in .18s ease-out;
}
@keyframes in { from { opacity: 0; transform: translate(-50%, -8px); } }
.text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text small { opacity: .85; font-weight: 400; margin-left: 6px; }
button { font: inherit; cursor: pointer; border: 0; border-radius: 999px; }
.reload { padding: 4px 12px; color: #0969da; background: #fff; }
.reload:hover { background: #ddf4ff; }
.close { width: 28px; height: 28px; color: #fff; background: transparent; font-size: 18px; line-height: 1; }
.close:hover { background: rgba(255, 255, 255, .15); }
`;

export interface Banner {
  show(summary: string, detail: string): void;
  hide(): void;
  destroy(): void;
}

export function createBanner(onReload: () => void, onDismiss: () => void): Banner {
  let host: HTMLElement | undefined;
  let text: HTMLElement | undefined;

  const mount = () => {
    host = document.createElement('div');
    host.dataset.bgl = 'freshness-banner';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
      <div class="bar" role="status" aria-live="polite">
        <span class="text"></span>
        <button class="reload" type="button">Reload</button>
        <button class="close" type="button" aria-label="Dismiss">×</button>
      </div>`;
    text = root.querySelector<HTMLElement>('.text')!;
    root.querySelector('.reload')!.addEventListener('click', onReload);
    root.querySelector('.close')!.addEventListener('click', () => {
      host?.remove();
      onDismiss();
    });
  };

  return {
    show(summary, detail) {
      if (!host) mount();
      text!.textContent = summary;
      if (detail) {
        const small = document.createElement('small');
        small.textContent = detail;
        text!.append(small);
      }
      if (!host!.isConnected) document.body.append(host!);
    },
    hide: () => host?.remove(),
    destroy() {
      host?.remove();
      host = undefined;
    },
  };
}
