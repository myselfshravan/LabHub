/**
 * "Fingerprints": small API snapshots of what a page shows. Comparing a fresh one with the
 * baseline taken at page load tells us whether the rendered page is stale, without reloading.
 *
 * Deliberately excluded: MR `detailed_merge_status` — GitLab recomputes it asynchronously and it
 * flips through `checking`/`unchecked`, which would make every page look stale.
 */
import type { GitLabApi } from '@/core/api';
import { waitFor } from '@/core/dom';
import type { PageContext } from '@/core/page';
import { SEL } from '@/core/selectors';

export type FieldValue = string | number | boolean | null;

export interface Fingerprint {
  /** Human labels per field, used to describe changes. Fields not listed are still compared. */
  fields: Record<string, FieldValue>;
  /** CI status for the tab-title indicator, when the page has one. */
  ciStatus?: string | null;
}

export interface Change {
  field: string;
  label: string;
  from: FieldValue;
  to: FieldValue;
}

const LABELS: Record<string, string> = {
  state: 'State',
  draft: 'Draft',
  sha: 'Commits',
  pipeline: 'Pipeline',
  notes: 'Comments',
  approvals: 'Approvals',
  conflicts: 'Conflicts',
  status: 'Status',
  items: 'List',
  shown: 'Items on this page',
  newest: 'New items',
  updated: 'Activity',
};

/**
 * Lists the fields that differ. `updated` (a bare timestamp) is only reported when nothing more
 * descriptive changed, since every other change bumps it too.
 */
export function diffFingerprints(a: Fingerprint, b: Fingerprint): Change[] {
  const keys = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
  const changes: Change[] = [];
  for (const field of keys) {
    const from = a.fields[field] ?? null;
    const to = b.fields[field] ?? null;
    if (from !== to) changes.push({ field, label: LABELS[field] ?? field, from, to });
  }
  const specific = changes.filter((c) => c.field !== 'updated');
  return specific.length ? specific : changes;
}

/** One-line description of a change for the banner. */
export function describeChange(c: Change): string {
  switch (c.field) {
    case 'sha':
      return 'New commits pushed';
    case 'pipelineId':
      return 'New pipeline started';
    case 'shown':
      return 'Items on this page were updated';
    case 'newest':
      return 'New items';
    case 'items':
    case 'updated':
      return 'New activity';
    case 'approvals':
      return 'Approvals changed';
    case 'notes': {
      const d = Number(c.to) - Number(c.from);
      return d > 0 ? `${d} new comment${d === 1 ? '' : 's'}` : 'Comments changed';
    }
    default:
      return `${c.label}: ${String(c.from ?? 'none')} → ${String(c.to ?? 'none')}`;
  }
}

// --- API response shapes (only the fields we use) ---------------------------------------------

interface ApiPipeline {
  id: number;
  status: string;
  updated_at: string;
}
interface ApiMergeRequest {
  id: number;
  updated_at: string;
  state: string;
  draft?: boolean;
  sha: string;
  user_notes_count: number;
  has_conflicts: boolean;
  head_pipeline?: ApiPipeline | null;
}
interface ApiApprovals {
  approved_by?: Array<{ user: { id: number } }>;
}
interface ApiIssue {
  updated_at: string;
  state: string;
  user_notes_count: number;
}
interface ApiJob {
  status: string;
  finished_at: string | null;
}
interface ListItem {
  id: number;
  iid?: number;
  state?: string;
  updated_at?: string;
  status?: string;
}

export type FingerprintFetcher = (signal: AbortSignal) => Promise<Fingerprint>;

/** Summarizes a list response so any add/remove/reorder/update shows up as a change. */
export function listFingerprint(items: ListItem[]): Fingerprint {
  const latest = items.reduce((m, i) => (i.updated_at && i.updated_at > m ? i.updated_at : m), '');
  return {
    fields: {
      items: items.map((i) => (i.status ? `${i.id}:${i.status}` : i.id)).join(','),
      updated: latest || null,
    },
  };
}

/** iids of the rows a MR/issue list currently renders, in page order. */
export function renderedIids(doc: Document = document): number[] {
  const iids: number[] = [];
  for (const a of doc.querySelectorAll<HTMLAnchorElement>(SEL.listItemLink)) {
    const m = /\/(?:merge_requests|issues|work_items)\/(\d+)/.exec(a.getAttribute('href') ?? '');
    if (m) iids.push(Number(m[1]));
  }
  return iids;
}

/**
 * Project list fingerprint that matches what the user sees regardless of sort order:
 * the rendered rows' current state, plus the newest item matching the page's filters
 * (so new arrivals are noticed too).
 */
export function renderedListFingerprint(
  rows: ListItem[],
  newest: ListItem | undefined,
): Fingerprint {
  return {
    fields: {
      shown: rows
        .map((r) => `${r.iid}:${r.state ?? ''}:${r.updated_at ?? ''}`)
        .sort()
        .join(','),
      newest: newest?.id ?? null,
    },
  };
}

/** Maps GitLab's list-page URL filters to API query params so we watch what's actually shown. */
export function listQuery(search: URLSearchParams, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ per_page: '20', order_by: 'updated_at', sort: 'desc', ...extra });
  q.set('state', search.get('state') ?? 'opened');
  for (const key of [
    'author_username',
    'assignee_username',
    'reviewer_username',
    'milestone_title',
    'search',
    'source_branch',
    'target_branch',
  ]) {
    const v = search.get(key);
    if (v) q.set(key, v);
  }
  const labels = search.getAll('label_name[]');
  if (labels.length) q.set('labels', labels.join(','));
  return q.toString();
}

/** Returns how to fingerprint this page, or undefined if the page type has no fingerprint. */
export function fetcherFor(page: PageContext, api: GitLabApi): FingerprintFetcher | undefined {
  const scope = page.scope;
  const proj = scope?.type === 'project' ? api.project(scope.fullPath) : undefined;
  const base =
    scope?.type === 'group' ? api.group(scope.fullPath) : scope?.type === 'project' ? proj : '';

  switch (page.kind) {
    case 'mr':
      if (!proj || !page.id) return;
      return async (signal) => {
        const path = `${proj}/merge_requests/${page.id}`;
        const [mr, approvals] = await Promise.all([
          api.get<ApiMergeRequest>(path, { signal }),
          // Approvals are best-effort: some tiers/instances restrict the endpoint.
          api.get<ApiApprovals>(`${path}/approvals`, { signal }).catch(() => null),
        ]);
        const hp = mr.head_pipeline;
        return {
          fields: {
            state: mr.state,
            draft: mr.draft ?? null,
            sha: mr.sha,
            pipeline: hp ? hp.status : null,
            pipelineId: hp ? hp.id : null,
            notes: mr.user_notes_count,
            conflicts: mr.has_conflicts,
            approvals: approvals
              ? (approvals.approved_by ?? [])
                  .map((a) => a.user.id)
                  .sort()
                  .join(',')
              : null,
            updated: mr.updated_at,
          },
          ciStatus: hp?.status ?? null,
        };
      };
    case 'issue':
      if (!proj || !page.id) return;
      return async (signal) => {
        const i = await api.get<ApiIssue>(`${proj}/issues/${page.id}`, { signal });
        return { fields: { state: i.state, notes: i.user_notes_count, updated: i.updated_at } };
      };
    case 'pipeline':
      if (!proj || !page.id) return;
      return async (signal) => {
        const p = await api.get<ApiPipeline>(`${proj}/pipelines/${page.id}`, { signal });
        return { fields: { status: p.status, updated: p.updated_at }, ciStatus: p.status };
      };
    case 'job':
      if (!proj || !page.id) return;
      return async (signal) => {
        const j = await api.get<ApiJob>(`${proj}/jobs/${page.id}`, { signal });
        return { fields: { status: j.status, updated: j.finished_at }, ciStatus: j.status };
      };
    case 'mr-list':
    case 'issue-list': {
      const res = page.kind === 'mr-list' ? 'merge_requests' : 'issues';
      if (scope?.type === 'dashboard') {
        // The dashboard defaults to "assigned to me"; reviewer filters come through listQuery.
        const extra: Record<string, string> = page.search.toString()
          ? {}
          : { scope: 'assigned_to_me' };
        return async (signal) =>
          listFingerprint(
            await api.get<ListItem[]>(`${res}?${listQuery(page.search, extra)}`, { signal }),
          );
      }
      if (!base) return;
      if (!proj) {
        // Group lists: rows span projects, so watch the filtered list itself.
        return async (signal) =>
          listFingerprint(
            await api.get<ListItem[]>(`${base}/${res}?${listQuery(page.search)}`, { signal }),
          );
      }
      return async (signal) => {
        // The list renders client-side; wait for rows (an empty list just never gets any).
        const iids =
          (await waitFor(
            () => {
              const ids = renderedIids();
              return ids.length > 0 && ids;
            },
            { signal },
          )) ?? [];
        const rowsQuery = new URLSearchParams({ state: 'all', per_page: '100' });
        for (const iid of iids.slice(0, 100)) rowsQuery.append('iids[]', String(iid));
        const newestQuery = listQuery(page.search, { order_by: 'created_at', per_page: '1' });
        const [rows, newest] = await Promise.all([
          iids.length ? api.get<ListItem[]>(`${proj}/${res}?${rowsQuery}`, { signal }) : [],
          api.get<ListItem[]>(`${proj}/${res}?${newestQuery}`, { signal }),
        ]);
        return renderedListFingerprint(rows, newest[0]);
      };
    }
    case 'pipeline-list':
      if (!proj) return;
      return async (signal) =>
        listFingerprint(await api.get<ListItem[]>(`${proj}/pipelines?per_page=20`, { signal }));
    case 'todos':
      return async (signal) =>
        listFingerprint(await api.get<ListItem[]>('todos?state=pending&per_page=50', { signal }));
    default:
      return;
  }
}
