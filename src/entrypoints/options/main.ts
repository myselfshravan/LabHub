/** Options page: feature + freshness settings, self-hosted hosts, and the log viewer. */
import '@/assets/ui.css';
import './options.css';
import { enabledHostPatterns, removeHost, requestHost } from '@/core/hosts';
import { logsItem } from '@/core/log-store';
import type { LogEntry, LogLevel } from '@/core/logger';
import {
  getSettings,
  updateSettings,
  type FreshnessSettings,
  type Settings,
} from '@/core/settings';
import { h, switchRow } from '@/core/ui';
import { FEATURES } from '@/features';

const app = document.getElementById('app')!;

function numberRow(label: string, hint: string, value: number, onChange: (n: number) => void) {
  return h(
    'label',
    { class: 'row' },
    h('div', {}, h('div', {}, label), h('p', {}, hint)),
    h('input', {
      type: 'number',
      min: 0,
      value: String(value),
      onchange: (e: Event) => {
        const n = Number((e.target as HTMLInputElement).value);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      },
    }),
  );
}

function freshnessCard(s: Settings) {
  const f = s.freshness;
  const set = (patch: Partial<FreshnessSettings>) => void updateSettings({ freshness: patch });
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Freshness'),
    switchRow('Check when returning to the tab', '', f.onFocus, (v) => set({ onFocus: v })),
    numberRow(
      'Away threshold (s)',
      'Ignore tab switches shorter than this.',
      f.hiddenThresholdSec,
      (v) => set({ hiddenThresholdSec: v }),
    ),
    switchRow('Poll while visible', 'Shows a banner when something changes.', f.poll, (v) =>
      set({ poll: v }),
    ),
    numberRow('Poll interval (s)', '', f.pollIntervalSec, (v) =>
      set({ pollIntervalSec: Math.max(5, v) }),
    ),
    h(
      'label',
      { class: 'row' },
      h(
        'div',
        {},
        h('div', {}, 'When a change is found on return'),
        h(
          'p',
          {},
          'Auto-reload only happens when nothing would be lost (no drafts, dialogs, selections).',
        ),
      ),
      h(
        'select',
        {
          onchange: (e: Event) =>
            set({ mode: (e.target as HTMLSelectElement).value as FreshnessSettings['mode'] }),
        },
        h('option', { value: 'auto', selected: f.mode === 'auto' }, 'Reload automatically'),
        h('option', { value: 'banner', selected: f.mode === 'banner' }, 'Only show a banner'),
      ),
    ),
    numberRow(
      'Other pages: reload after away (s)',
      'Code, settings, etc. have no change detection; reload them if away this long. 0 = never.',
      f.genericReloadAfterSec,
      (v) => set({ genericReloadAfterSec: v }),
    ),
    switchRow(
      'CI status in tab title',
      'e.g. ✅ / ❌ / 🔄 before MR and pipeline titles.',
      f.titleStatus,
      (v) => set({ titleStatus: v }),
    ),
  );
}

async function hostsCard() {
  const patterns = await enabledHostPatterns();
  const input = h('input', { type: 'text', placeholder: 'https://gitlab.example.com' });
  const error = h('p', { class: 'error' });
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'GitLab instances'),
    h(
      'div',
      { class: 'row' },
      h('code', {}, 'https://gitlab.com'),
      h('span', { class: 'muted' }, 'built in'),
    ),
    ...patterns.map((p) =>
      h(
        'div',
        { class: 'row' },
        h('code', {}, p.replace(/\/\*$/, '')),
        h(
          'button',
          { class: 'danger', onclick: async () => (await removeHost(p), render()) },
          'Remove',
        ),
      ),
    ),
    h(
      'form',
      {
        class: 'row',
        onsubmit: async (e: Event) => {
          e.preventDefault();
          try {
            if (await requestHost(input.value.trim())) void render();
          } catch {
            error.textContent = 'Enter a full URL like https://gitlab.example.com';
          }
        },
      },
      input,
      h('button', { class: 'primary', type: 'submit' }, 'Add'),
    ),
    error,
  );
}

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function logsCard(s: Settings) {
  const body = h('tbody');
  const level = h(
    'select',
    { onchange: () => void fill() },
    ...LEVELS.map((l) => h('option', { value: l, selected: l === 'info' }, `${l}+`)),
  );
  const filter = h('input', {
    type: 'text',
    placeholder: 'Filter (namespace or text)',
    oninput: () => void fill(),
  });

  const fmt = (e: LogEntry) =>
    h(
      'tr',
      { class: `lvl-${e.level}` },
      h('td', {}, new Date(e.t).toLocaleTimeString()),
      h('td', {}, e.level),
      h('td', {}, h('code', {}, e.ns)),
      h(
        'td',
        { title: e.url ?? '' },
        e.msg,
        e.data === undefined ? null : h('code', { class: 'data' }, JSON.stringify(e.data)),
      ),
    );

  async function fill() {
    const min = LEVELS.indexOf(level.value as LogLevel);
    const q = filter.value.toLowerCase();
    const entries = (await logsItem.getValue())
      .filter((e) => LEVELS.indexOf(e.level) >= min)
      .filter(
        (e) => !q || `${e.ns} ${e.msg} ${JSON.stringify(e.data ?? '')}`.toLowerCase().includes(q),
      )
      .slice(-300)
      .reverse();
    body.replaceChildren(
      ...(entries.length
        ? entries.map(fmt)
        : [h('tr', {}, h('td', { colSpan: 4 }, 'No logs yet.'))]),
    );
  }

  const exportLogs = async () => {
    const blob = new Blob([JSON.stringify(await logsItem.getValue(), null, 2)], {
      type: 'application/json',
    });
    const a = h('a', {
      href: URL.createObjectURL(blob),
      download: `better-gitlab-logs-${Date.now()}.json`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  void fill();
  logsItem.watch(() => void fill());

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Logs'),
    switchRow(
      'Debug logging in the page console',
      'All levels are always kept here.',
      s.debug,
      (v) => void updateSettings({ debug: v }),
    ),
    h(
      'div',
      { class: 'toolbar' },
      level,
      filter,
      h('button', { onclick: () => void fill() }, 'Refresh'),
      h('button', { onclick: exportLogs }, 'Export'),
      h(
        'button',
        { class: 'danger', onclick: async () => (await logsItem.setValue([]), fill()) },
        'Clear',
      ),
    ),
    h('div', { class: 'logs' }, h('table', {}, body)),
  );
}

async function render() {
  const s = await getSettings();
  app.replaceChildren(
    h('h1', {}, 'Better GitLab'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Features'),
      switchRow(
        'Enabled',
        'Master switch for everything below.',
        s.enabled,
        (v) => void updateSettings({ enabled: v }).then(render),
      ),
      ...FEATURES.map((f) =>
        switchRow(
          f.title,
          f.description,
          s.features[f.id] ?? f.defaultOn,
          (on) => void updateSettings({ features: { [f.id]: on } }),
        ),
      ),
    ),
    freshnessCard(s),
    await hostsCard(),
    logsCard(s),
  );
}

void render();
