/**
 * Short tab titles that lead with the repo, so tabs are tellable apart:
 *   "Fix login (!12) · Merge requests · Acme / agent-os-ui · GitLab" → "agent-os-ui !12 Fix login"
 *   "Merge requests · Acme / agent-os-ui · GitLab"                     → "agent-os-ui · MRs"
 */
import { defineFeature } from '@/core/feature';
import type { PageContext } from '@/core/page';
import { tabTitle } from '@/core/title';

const LIST_LABEL: Partial<Record<PageContext['kind'], string>> = {
  'mr-list': 'MRs',
  'issue-list': 'Issues',
  'pipeline-list': 'Pipelines',
};

/** Rewrites GitLab's "Item · Section · Namespace / Project · GitLab" title for this page. */
export function shortTitle(page: PageContext, title: string): string {
  const scope = page.scope;
  if (!scope || scope.type === 'dashboard') return title;
  const name = scope.fullPath.split('/').pop() || scope.fullPath;

  const segs = title.split(' · ');
  if (segs.length > 1 && segs.at(-1) === 'GitLab') segs.pop();
  // Only the "Namespace / Project" segment left: the project (or group) home.
  if (segs.length <= 1) return name;

  const list = LIST_LABEL[page.kind];
  if (list) return `${name} · ${list}`;

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
    'Lead tab titles with the repo name, e.g. "agent-os-ui · MRs" or "agent-os-ui !12 Fix login".',
  defaultOn: true,
  init({ page }) {
    tabTitle.setRewrite((t) => shortTitle(page, t));
    return () => tabTitle.setRewrite(undefined);
  },
});
