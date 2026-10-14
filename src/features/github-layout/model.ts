/** Pure logic behind the GitHub-style repo header: which tabs, which is active, row states. */
import type { OcticonName } from '@/core/octicons';
import type { PageContext } from '@/core/page';

export type TabId = 'code' | 'issues' | 'mrs' | 'pipelines' | 'wiki' | 'settings';

export interface RepoTab {
  id: TabId;
  label: string;
  icon: OcticonName;
  href: string;
}

/** GitHub's repo tabs, mapped to the GitLab page that plays the same role. */
export function repoTabs(fullPath: string): RepoTab[] {
  const p = `/${fullPath}`;
  return [
    { id: 'code', label: 'Code', icon: 'code', href: p },
    { id: 'issues', label: 'Issues', icon: 'issue', href: `${p}/-/issues` },
    { id: 'mrs', label: 'Merge requests', icon: 'pr', href: `${p}/-/merge_requests` },
    { id: 'pipelines', label: 'Pipelines', icon: 'play', href: `${p}/-/pipelines` },
    { id: 'wiki', label: 'Wiki', icon: 'book', href: `${p}/-/wikis/home` },
    { id: 'settings', label: 'Settings', icon: 'gear', href: `${p}/edit` },
  ];
}

/**
 * Tabs the project actually offers, judged by the links GitLab's own sidebar renders (it
 * already accounts for disabled features and the viewer's permissions). Without a sidebar to
 * read, fall back to the tabs every project has.
 */
export function availableTabs(tabs: RepoTab[], sidebarPaths: string[]): RepoTab[] {
  // Only this project's links count (the sidebar also links groups, other projects, ...).
  const base = `${tabs.find((t) => t.id === 'code')?.href ?? ''}/`;
  const own = sidebarPaths.filter((p) => p.startsWith(base));
  if (!own.length) return tabs.filter((t) => ['code', 'mrs', 'pipelines'].includes(t.id));
  const has = (re: RegExp) => own.some((p) => re.test(p));
  const test: Record<TabId, RegExp> = {
    code: /./,
    issues: /\/-\/(issues|work_items)\/?$/,
    mrs: /\/-\/merge_requests\/?$/,
    pipelines: /\/-\/pipelines\/?$/,
    wiki: /\/-\/wikis\b/,
    settings: /\/edit$|\/-\/settings\b/,
  };
  return tabs.filter((t) => t.id === 'code' || has(test[t.id]));
}

export function activeTab(page: PageContext): TabId | undefined {
  switch (page.kind) {
    case 'mr':
    case 'mr-list':
      return 'mrs';
    case 'issue':
    case 'issue-list':
      return 'issues';
    case 'pipeline':
    case 'pipeline-list':
    case 'job':
      return 'pipelines';
    case 'code':
    case 'project':
      return 'code';
  }
  if (/\/-\/wikis\b/.test(page.pathname)) return 'wiki';
  if (/\/edit$|\/-\/settings\b/.test(page.pathname)) return 'settings';
  if (/\/-\/(jobs|pipeline_schedules|environments|artifacts)\b/.test(page.pathname)) {
    return 'pipelines';
  }
  if (/\/-\/(branches|tags|graphs|network|compare|find_file)\b/.test(page.pathname)) return 'code';
  return undefined;
}

/** GitHub-style compact count: 999, 1k, 1.2k, 12k. */
export function shortCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? Math.floor(k * 10) / 10 : Math.floor(k)}k`;
}

export type RowState = 'open' | 'draft' | 'merged' | 'closed';

/**
 * State of one MR/issue list row, for GitHub's colored state icon. The list's own state tab
 * decides it when it's a single-state view; on "All" we read the row's status text.
 */
export function rowState(listState: string | null, title: string, rowText: string): RowState {
  if (listState === 'merged') return 'merged';
  if (listState === 'closed') return 'closed';
  if (listState === 'all') {
    if (/\bMerged\b/.test(rowText)) return 'merged';
    if (/\bClosed\b/.test(rowText)) return 'closed';
  }
  return /^\s*(\[draft\]|draft:|\(draft\))/i.test(title) ? 'draft' : 'open';
}

export type DiffBlock = 'add' | 'del' | 'neutral';

/**
 * GitHub's five-square diffstat (■■■□□): squares split between additions and deletions in
 * proportion; small changes fill only as many squares as lines changed.
 */
export function diffstatBlocks(added: number, removed: number): DiffBlock[] {
  const total = added + removed;
  const filled = Math.min(5, total);
  const add = total ? Math.round((added / total) * filled) : 0;
  const del = filled - add;
  return [
    ...Array<DiffBlock>(add).fill('add'),
    ...Array<DiffBlock>(del).fill('del'),
    ...Array<DiffBlock>(5 - filled).fill('neutral'),
  ];
}

/** Reads "+47 −3" style stats text (GitLab uses a real minus sign, sometimes with spaces). */
export function parseDiffStats(text: string): { added: number; removed: number } | undefined {
  const a = /\+\s*([\d,]+)/.exec(text);
  const r = /[−-]\s*([\d,]+)/.exec(text);
  if (!a || !r) return undefined;
  const n = (s: string) => Number(s.replaceAll(',', ''));
  return { added: n(a[1]!), removed: n(r[1]!) };
}
