/** Popup: master switch, per-feature toggles, and enabling the current self-hosted site. */
import '@/assets/ui.css';
import './popup.css';
import { browser } from 'wxt/browser';
import { enabledHostPatterns, originPattern, requestHost } from '@/core/hosts';
import { getSettings, isFeatureOn, updateSettings } from '@/core/settings';
import { h, switchRow } from '@/core/ui';
import { FEATURES } from '@/features';

async function siteSection(): Promise<HTMLElement | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) return null;
  const origin = new URL(tab.url).origin;
  if (origin === 'https://gitlab.com') return h('p', {}, 'Active on gitlab.com');

  const enabled = (await enabledHostPatterns()).includes(originPattern(origin));
  if (enabled) return h('p', {}, `Active on ${new URL(origin).host}`);

  const host = new URL(origin).host;
  return h(
    'div',
    { class: 'site' },
    h('p', {}, `Self-hosted GitLab at ${host}?`),
    h(
      'button',
      {
        class: 'primary',
        onclick: async () => {
          // The background registers the script and injects into open tabs on grant.
          if (await requestHost(origin)) window.close();
        },
      },
      `Enable on ${host}`,
    ),
  );
}

async function render() {
  const app = document.getElementById('app')!;
  const settings = await getSettings();

  const features = h(
    'div',
    { class: 'card' },
    ...FEATURES.map((f) =>
      switchRow(
        f.title,
        f.description,
        settings.features[f.id] ?? f.defaultOn,
        (on) => void updateSettings({ features: { [f.id]: on } }),
      ),
    ),
  );
  features.toggleAttribute('inert', !settings.enabled);
  features.classList.toggle('disabled', !settings.enabled);

  app.replaceChildren(
    h(
      'header',
      { class: 'row' },
      h('h1', {}, 'Better GitLab'),
      h('input', {
        type: 'checkbox',
        class: 'switch',
        title: 'Turn everything on/off',
        checked: settings.enabled,
        onchange: async (e: Event) => {
          await updateSettings({ enabled: (e.target as HTMLInputElement).checked });
          void render();
        },
      }),
    ),
    features,
    (await siteSection()) ?? '',
    h(
      'footer',
      { class: 'row' },
      h(
        'span',
        { class: 'muted' },
        isFeatureOn(settings, 'freshness', true) ? 'Pages stay fresh' : 'Paused',
      ),
      h('button', { onclick: () => browser.runtime.openOptionsPage() }, 'Settings & logs'),
    ),
  );
}

void render();
