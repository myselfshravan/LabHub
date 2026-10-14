/**
 * GitHub's page structure:
 *  - no permanent left sidebar: GitLab's sidebar is hidden behind a ☰ button in the top bar
 *    (GitHub's spot). Opening it docks it back in its column, pushing the page over, and the
 *    choice sticks.
 *  - on project pages, an "owner / repo" header with Star/Fork counters and the
 *    Code · Issues · Merge requests · Pipelines tab bar.
 *  - MR/issue list rows tagged with their state so GitHub's colored state icons can be drawn.
 */
import { defineFeature } from '@/core/feature';
import { octicon } from '@/core/octicons';
import type { PageContext } from '@/core/page';
import { SEL } from '@/core/selectors';
import { waitFor } from '@/core/dom';
import css from './layout.css?inline';
import {
  activeTab,
  availableTabs,
  diffstatBlocks,
  parseDiffStats,
  repoTabs,
  rowState,
  shortCount,
  type TabId,
} from './model';

interface ApiProject {
  name: string;
  visibility?: 'public' | 'internal' | 'private';
  star_count: number;
  forks_count: number;
  open_issues_count?: number;
}

const ROOT_CLASS = 'bgl-gh-layout';
const OPEN_CLASS = 'bgl-sidebar-open';
/** Per-browser memory of the ☰ state (a convenience, so plain localStorage is right). */
const OPEN_KEY = 'bgl:sidebar-open';

function rememberedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
function rememberOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* storage blocked: the toggle still works for this page */
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

const counter = (n: number | undefined) =>
  el(
    'span',
    { class: 'bgl-counter', title: n === undefined ? '' : String(n) },
    n === undefined ? '' : shortCount(n),
  );

/** Tags MR/issue list rows with their state (re-applied as the client-rendered list changes). */
function tagListRows(page: PageContext, signal: AbortSignal, onCleanup: (fn: () => void) => void) {
  if (page.kind !== 'mr-list' && page.kind !== 'issue-list') return;
  const listState = page.search.get('state');
  const tagRows = () => {
    for (const li of document.querySelectorAll<HTMLElement>('.issuable-list > li')) {
      const titleText = li.querySelector(SEL.listItemLink)?.textContent ?? '';
      const status =
        li.querySelector('.issuable-status, [data-testid="issuable-status"]')?.textContent ?? '';
      const state = rowState(listState, titleText, status);
      if (li.dataset.bglState !== state) li.dataset.bglState = state;
    }
  };
  tagRows();
  // Only child-list changes: our own attribute writes don't retrigger it.
  const obs = new MutationObserver(tagRows);
  obs.observe(document.querySelector('.content-wrapper') ?? document.body, {
    childList: true,
    subtree: true,
  });
  signal.addEventListener('abort', () => obs.disconnect());
  onCleanup(() => {
    for (const li of document.querySelectorAll<HTMLElement>('[data-bgl-state]')) {
      delete li.dataset.bglState;
    }
  });
}

/** GitLab's "+N −M" diff stats (overall and per file) get GitHub's five-square diffstat bar. */
const DIFF_STATS = '.rd-diff-file-stats, .diff-stats-contents, .file-title-flex-parent .diff-stats';

function decorateDiffStats(signal: AbortSignal, onCleanup: (fn: () => void) => void) {
  const apply = () => {
    for (const host of document.querySelectorAll<HTMLElement>(DIFF_STATS)) {
      const own = host.querySelector(':scope > .bgl-diffstat');
      const stats = parseDiffStats(host.textContent ?? '');
      if (!stats) continue;
      const key = `${stats.added}/${stats.removed}`;
      if (own?.getAttribute('data-key') === key) continue;
      own?.remove();
      const bar = el('span', {
        class: 'bgl-diffstat',
        'data-key': key,
        'aria-hidden': 'true',
        title: `${stats.added + stats.removed} lines changed`,
      });
      for (const b of diffstatBlocks(stats.added, stats.removed)) {
        bar.append(el('span', { class: `bgl-diffstat-${b}` }));
      }
      host.append(bar);
    }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!signal.aborted) apply();
    });
  };
  apply();
  // Diff files render lazily as you scroll; our own bars are filtered out to avoid loops.
  const obs = new MutationObserver((records) => {
    if (
      records.some((r) =>
        [...r.addedNodes].some((n) => !(n as Element).classList?.contains('bgl-diffstat')),
      )
    ) {
      schedule();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  signal.addEventListener('abort', () => obs.disconnect());
  onCleanup(() => document.querySelectorAll('.bgl-diffstat').forEach((e) => e.remove()));
}

export default defineFeature({
  id: 'github-layout',
  title: 'GitHub layout',
  description:
    'No permanent sidebar (☰ in the top bar brings it back), a repo header with Code / Issues / Merge requests / Pipelines tabs, and GitHub state icons in lists.',
  defaultOn: true,
  css,

  async init({ page, api, log, signal, onCleanup }) {
    const root = document.documentElement;
    root.classList.add(ROOT_CLASS);
    root.classList.toggle(OPEN_CLASS, rememberedOpen());
    onCleanup(() => root.classList.remove(ROOT_CLASS, OPEN_CLASS));

    // --- ☰ in the top bar, where GitHub has it ----------------------------------------------
    const menu = el(
      'button',
      {
        class: 'btn gl-button btn-default btn-md btn-default-tertiary btn-icon bgl-menu-btn',
        type: 'button',
        'aria-label': 'Toggle sidebar',
        title: 'Toggle sidebar',
      },
      octicon('menu'),
    );
    const sync = () =>
      menu.setAttribute('aria-pressed', String(root.classList.contains(OPEN_CLASS)));
    sync();
    menu.addEventListener(
      'click',
      () => {
        rememberOpen(root.classList.toggle(OPEN_CLASS));
        sync();
      },
      { signal },
    );
    const topLeft = document.querySelector('.super-topbar > div');
    if (topLeft) {
      topLeft.prepend(menu);
      onCleanup(() => menu.remove());
    }

    tagListRows(page, signal, onCleanup);
    if (page.kind === 'mr' || /\/-\/(commit|compare)\b/.test(page.pathname)) {
      decorateDiffStats(signal, onCleanup);
    }

    if (page.scope?.type !== 'project') return;
    const fullPath = page.scope.fullPath;

    // --- repo header ------------------------------------------------------------------------
    const segments = fullPath.split('/');
    const name = segments.pop()!;
    const owner = segments.join('/');

    const visibility = el('span', { class: 'bgl-label-pill', hidden: '' });
    const stars = counter(undefined);
    const forks = counter(undefined);
    const starBtn = el(
      'a',
      { class: 'bgl-btn', href: `/${fullPath}/-/starrers` },
      octicon('star'),
      'Star',
      stars,
    );
    const forkBtn = el(
      'a',
      { class: 'bgl-btn', href: `/${fullPath}/-/forks` },
      octicon('fork'),
      'Fork',
      forks,
    );

    const title = el(
      'div',
      { class: 'bgl-repo-title' },
      octicon('repo'),
      ...(owner
        ? [
            el('a', { href: `/${owner}`, class: 'bgl-owner' }, owner.replaceAll('/', ' / ')),
            el('span', { class: 'bgl-sep' }, '/'),
          ]
        : []),
      el('a', { href: `/${fullPath}`, class: 'bgl-repo' }, name),
      visibility,
    );

    const sidebarPaths = [
      ...document.querySelectorAll<HTMLAnchorElement>('#super-sidebar a[href]'),
    ].map((a) => a.pathname);
    const active = activeTab(page);
    const counters = new Map<TabId, HTMLElement>();
    const tabs = el(
      'nav',
      { class: 'bgl-tabs', 'aria-label': 'Repository' },
      ...availableTabs(repoTabs(fullPath), sidebarPaths).map((t) => {
        const c = counter(undefined);
        counters.set(t.id, c);
        const a = el(
          'a',
          { href: t.href, class: 'bgl-tab' },
          octicon(t.icon),
          el('span', {}, t.label),
          c,
        );
        if (t.id === active) a.setAttribute('aria-current', 'page');
        return a;
      }),
    );

    const header = el(
      'div',
      { 'data-bgl': 'repo-header', class: 'bgl-repo-header' },
      el(
        'div',
        { class: 'bgl-repo-top' },
        title,
        el('div', { class: 'bgl-repo-actions' }, starBtn, forkBtn),
      ),
      tabs,
    );

    const host = await waitFor(() => document.querySelector(SEL.scrollPanel), {
      signal,
      timeoutMs: 5000,
    });
    if (signal.aborted) return;
    const mount = host ?? document.querySelector('.content-wrapper');
    if (!mount) {
      log.info('no content panel found; header skipped');
    } else {
      mount.prepend(header);
      onCleanup(() => header.remove());
    }

    // --- "Title !123" and the big state pill, like GitHub's issue/PR header ---------------
    if ((page.kind === 'mr' || page.kind === 'issue') && page.id) {
      const ref = `${page.kind === 'mr' ? '!' : '#'}${page.id}`;
      void waitFor(() => document.querySelector(SEL.detailTitle), { signal }).then((h1) => {
        if (!h1 || signal.aborted) return;
        if (!h1.querySelector('.bgl-title-ref')) {
          const span = el('span', { class: 'bgl-title-ref' }, ref);
          h1.append(span);
          onCleanup(() => span.remove());
        }
        // GitLab's state badge has no stable hook of its own; it's the nearest state-named pill
        // around the title.
        const isState = (b: Element) =>
          /^(Open|Closed|Merged|Locked)$/.test(b.textContent?.trim() ?? '');
        let badge: HTMLElement | undefined;
        for (
          let n: Element | null = h1.parentElement, i = 0;
          n && !badge && i < 6;
          n = n.parentElement, i++
        ) {
          badge = [...n.querySelectorAll<HTMLElement>('.gl-badge.badge-pill')].find(isState);
        }
        if (badge) {
          badge.classList.add('bgl-state-badge');
          onCleanup(() => badge.classList.remove('bgl-state-badge'));
        }
      });
    }

    // --- counts ------------------------------------------------------------------------------
    const proj = api.project(fullPath);
    const [info, mrs] = await Promise.all([
      api.get<ApiProject>(proj, { signal }).catch(() => undefined),
      api
        .total(`${proj}/merge_requests?state=opened&per_page=1`, { signal })
        .catch(() => undefined),
    ]);
    if (signal.aborted) return;
    if (info) {
      stars.textContent = shortCount(info.star_count);
      forks.textContent = shortCount(info.forks_count);
      if (info.visibility) {
        visibility.textContent = info.visibility[0]!.toUpperCase() + info.visibility.slice(1);
        visibility.hidden = false;
      }
      const issues = counters.get('issues');
      if (issues && info.open_issues_count !== undefined)
        issues.textContent = shortCount(info.open_issues_count);
    }
    const mrCounter = counters.get('mrs');
    if (mrCounter && mrs !== undefined) mrCounter.textContent = shortCount(mrs);
  },
});
