/**
 * Short tab titles that lead with the repo, so tabs are tellable apart:
 *   "Fix login (!12) · Merge requests · Acme / web-app · GitLab" → "web-app !12 Fix login"
 *   "Merge requests · Acme / web-app · GitLab"                     → "web-app · MRs (3)"
 * MR and issue list tabs carry the number of open items, kept current while the tab is hidden.
 */
import { defineFeature } from '@/core/feature';
import type { GitLabApi } from '@/core/api';
import type { PageContext } from '@/core/page';
import { tabTitle } from '@/core/title';

const LIST_LABEL: Partial<Record<PageContext['kind'], string>> = {
  'mr-list': 'MRs',
  'issue-list': 'Issues',
  'pipeline-list': 'Pipelines',
};

/** Open-item count shown on list tabs; refreshed this often while the tab is hidden. */
const COUNT_REFRESH_MS = 60_000;

/**
 * Rewrites GitLab's "Item · Section · Namespace / Project · GitLab" title for this page.
 * `openCount` (MR/issue lists) is appended as "(n)".
 */
export function shortTitle(page: PageContext, title: string, openCount?: number): string {
  const scope = page.scope;
  if (!scope || scope.type === 'dashboard') return title;
  const name = scope.fullPath.split('/').pop() || scope.fullPath;

  const segs = title.split(' · ');
  if (segs.length > 1 && segs.at(-1) === 'GitLab') segs.pop();
  // Only the "Namespace / Project" segment left: the project (or group) home.
  if (segs.length <= 1) return name;

  const list = LIST_LABEL[page.kind];
  if (list) return `${name} · ${list}${openCount === undefined ? '' : ` (${openCount})`}`;

  if (page.kind === 'mr' || page.kind === 'issue') {
    // Sub-tabs may prepend a section ("Changes · Title (!1) · ..."), so search every segment.
    const ref = page.kind === 'mr' ? '!' : '#';
    for (const seg of segs) {
      const m = new RegExp(`^(.*) \\(${ref}(\\d+)\\)$`).exec(seg);
      if (m) return `${name} ${ref}${m[2]} ${m[1]}`;
    }
  }

  // Jobs are titled "name (#123)"; the id is noise next to the job name.
  const first = page.kind === 'job' ? segs[0]!.replace(/ \(#\d+\)$/, '') : segs[0]!;
  return `${name} · ${first}`;
}

export default defineFeature({
  id: 'tab-titles',
  title: 'Short tab titles',
  description:
    'Lead tab titles with the repo name, e.g. "web-app · MRs" or "web-app !12 Fix login".',
  defaultOn: true,
  init({ page, api, log, signal }) {
    let count: number | undefined;
    tabTitle.setRewrite((t) => shortTitle(page, t, count));

    const path = openCountPath(page, api);
    if (path) {
      const refresh = async () => {
        try {
          const n = await api.total(path, { signal });
          if (signal.aborted || n === count) return;
          count = n;
          tabTitle.setRewrite((t) => shortTitle(page, t, count));
        } catch (err) {
          log.debug('open count unavailable', err);
        }
      };
      void refresh();
      const id = setInterval(() => {
        if (document.visibilityState === 'hidden') void refresh();
      }, COUNT_REFRESH_MS);
      signal.addEventListener('abort', () => clearInterval(id));
    }
    return () => tabTitle.setRewrite(undefined);
  },
});

/** REST list path whose X-Total is the number of open MRs/issues for a list page's scope. */
export function openCountPath(page: PageContext, api: GitLabApi): string | undefined {
  const res =
    page.kind === 'mr-list' ? 'merge_requests' : page.kind === 'issue-list' ? 'issues' : undefined;
  const scope = page.scope;
  if (!res || !scope || scope.type === 'dashboard') return undefined;
  const base = scope.type === 'project' ? api.project(scope.fullPath) : api.group(scope.fullPath);
  return `${base}/${res}?state=opened&per_page=1`;
}
