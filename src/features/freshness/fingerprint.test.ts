import { describe, expect, it, vi } from 'vitest';
import type { GitLabApi } from '@/core/api';
import { parsePage } from '@/core/page';
import {
  describeChange,
  diffFingerprints,
  fetcherFor,
  listFingerprint,
  listOrder,
  listQuery,
  renderedIids,
  renderedListFingerprint,
} from './fingerprint';

const fp = (fields: Record<string, string | number | null>) => ({ fields });

describe('diffFingerprints', () => {
  it('reports specific changes and hides the generic timestamp when others exist', () => {
    const changes = diffFingerprints(
      fp({ pipeline: 'running', notes: 1, updated: 'a' }),
      fp({ pipeline: 'success', notes: 3, updated: 'b' }),
    );
    expect(changes.map((c) => c.field)).toEqual(['pipeline', 'notes']);
    expect(changes.map(describeChange)).toEqual(['Pipeline: running → success', '2 new comments']);
  });

  it('falls back to the timestamp when it is the only difference', () => {
    const changes = diffFingerprints(fp({ updated: 'a' }), fp({ updated: 'b' }));
    expect(changes.map(describeChange)).toEqual(['New activity']);
  });

  it('is empty for identical fingerprints', () => {
    expect(diffFingerprints(fp({ a: 1 }), fp({ a: 1 }))).toEqual([]);
  });
});

describe('list helpers', () => {
  it('fingerprints ids, statuses and latest update', () => {
    expect(
      listFingerprint([
        { id: 2, status: 'running', updated_at: '2026-01-02' },
        { id: 1, status: 'success', updated_at: '2026-01-03' },
      ]).fields,
    ).toEqual({ items: '2:running,1:success', updated: '2026-01-03' });
  });

  it('maps GitLab UI filters to API params', () => {
    const q = new URLSearchParams(
      listQuery(
        new URLSearchParams('state=merged&author_username=me&label_name[]=a&label_name[]=b&sort=x'),
      ),
    );
    expect(q.get('state')).toBe('merged');
    expect(q.get('author_username')).toBe('me');
    expect(q.get('labels')).toBe('a,b');
    expect(q.get('order_by')).toBe('updated_at');
  });
});

describe('rendered list', () => {
  it('reads row iids from the list DOM', () => {
    document.body.innerHTML = `
      <a data-testid="issuable-title-link" href="/o/r/-/merge_requests/12">a</a>
      <a data-testid="issuable-title-link" href="/o/r/-/work_items/7">b</a>
      <a href="/o/r/-/merge_requests/99">not a row</a>`;
    expect(renderedIids()).toEqual([12, 7]);
  });

  it('is order-independent and notices updates and new arrivals', () => {
    const a = renderedListFingerprint(
      [
        { id: 1, iid: 2, state: 'opened', updated_at: 't1' },
        { id: 2, iid: 1, state: 'opened', updated_at: 't1' },
      ],
      { id: 50 },
    );
    const same = renderedListFingerprint(
      [
        { id: 2, iid: 1, state: 'opened', updated_at: 't1' },
        { id: 1, iid: 2, state: 'opened', updated_at: 't1' },
      ],
      { id: 50 },
    );
    expect(diffFingerprints(a, same)).toEqual([]);
    const merged = renderedListFingerprint(
      [
        { id: 1, iid: 2, state: 'merged', updated_at: 't2' },
        { id: 2, iid: 1, state: 'opened', updated_at: 't1' },
      ],
      { id: 51 },
    );
    expect(diffFingerprints(a, merged).map(describeChange)).toEqual([
      'Items on this page were updated',
      'New items',
    ]);
  });
});

describe('listOrder', () => {
  const doc = (label: string, dir: string) => {
    document.body.innerHTML = `<div class="sort-dropdown-container">${label}</div>
      <button aria-label="Sort direction: ${dir}"></button>`;
    return document;
  };

  it.each([
    ['created_date', 'created_at', 'desc'],
    ['created_asc', 'created_at', 'asc'],
    ['updated_desc', 'updated_at', 'desc'],
    ['merged_at_asc', 'merged_at', 'asc'],
    ['popularity', 'popularity', 'desc'],
  ])('URL sort=%s → %s %s', (sort, order_by, dir) => {
    expect(listOrder(new URLSearchParams({ sort }), doc('Title', 'Ascending'))).toEqual({
      order_by,
      sort: dir,
    });
  });

  it('falls back to the sort control on the page', () => {
    expect(listOrder(new URLSearchParams(), doc(' Updated date ', 'Ascending'))).toEqual({
      order_by: 'updated_at',
      sort: 'asc',
    });
  });

  it('is undefined for sorts the API cannot reproduce', () => {
    expect(listOrder(new URLSearchParams({ sort: 'closed_at_desc' }))).toBeUndefined();
    expect(listOrder(new URLSearchParams(), doc('Blocking', 'Descending'))).toBeUndefined();
  });
});

describe('fetcherFor', () => {
  const api = (responses: Record<string, unknown>): GitLabApi => ({
    get: vi.fn(async (path: string) => {
      const key = Object.keys(responses).find((k) => path.startsWith(k));
      if (!key) throw new Error(`unexpected ${path}`);
      return responses[key];
    }) as GitLabApi['get'],
    getPageJson: vi.fn(async (path: string) => {
      if (path in responses) return responses[path];
      throw new Error(`unexpected ${path}`);
    }) as GitLabApi['getPageJson'],
    project: (p) => `projects/${encodeURIComponent(p)}`,
    group: (p) => `groups/${encodeURIComponent(p)}`,
  });
  const page = (path: string) => parsePage(new URL(`https://gitlab.com${path}`), null);

  it('builds an MR fingerprint including pipeline and approvals', async () => {
    const a = api({
      'projects/o%2Fr/merge_requests/5/approvals': {
        approved_by: [{ user: { id: 9 } }, { user: { id: 3 } }],
      },
      'projects/o%2Fr/merge_requests/5': {
        state: 'opened',
        sha: 'abc',
        user_notes_count: 2,
        has_conflicts: false,
        updated_at: 't',
        head_pipeline: { id: 77, status: 'running', updated_at: 't' },
      },
    });
    const f = await fetcherFor(page('/o/r/-/merge_requests/5'), a)!(new AbortController().signal);
    expect(f.ciStatus).toBe('running');
    expect(f.fields).toMatchObject({
      pipeline: 'running',
      pipelineId: 77,
      approvals: '3,9',
      sha: 'abc',
    });
  });

  it('fingerprints a project list by its rendered rows', async () => {
    document.body.innerHTML =
      '<a data-testid="issuable-title-link" href="/o/r/-/merge_requests/5">x</a>';
    const a = api({
      'projects/o%2Fr/merge_requests?state=all': [
        { id: 1, iid: 5, state: 'opened', updated_at: 't' },
      ],
      'projects/o%2Fr/merge_requests?': [{ id: 9 }],
    });
    const f = await fetcherFor(page('/o/r/-/merge_requests'), a)!(new AbortController().signal);
    expect(f.fields).toEqual({ shown: '1:opened:t', newest: 9 });
    expect(vi.mocked(a.get).mock.calls[0]![0]).toContain('iids%5B%5D=5');
  });

  it('fingerprints a group list in the page sort order', async () => {
    document.body.innerHTML = `<div class="sort-dropdown-container">Created date</div>
      <button aria-label="Sort direction: Descending"></button>`;
    const a = api({ 'groups/acme/merge_requests?': [{ id: 3, state: 'opened', updated_at: 't' }] });
    const f = await fetcherFor(page('/groups/acme/-/merge_requests'), a)!(
      new AbortController().signal,
    );
    expect(f.fields).toEqual({ shown: '3:opened:t', newest: null });
    const url = vi.mocked(a.get).mock.calls[0]![0];
    expect(url).toContain('order_by=created_at');
    expect(url).toContain('sort=desc');
  });

  it('fingerprints jobs from the page JSON (works signed out)', async () => {
    const a = api({ 'o/r/-/jobs/3.json': { status: { group: 'running' }, finished_at: null } });
    const f = await fetcherFor(page('/o/r/-/jobs/3'), a)!(new AbortController().signal);
    expect(f).toEqual({ fields: { status: 'running', updated: null }, ciStatus: 'running' });
  });

  it('has no fetcher for code pages', () => {
    expect(fetcherFor(page('/o/r/-/blob/main/x'), api({}))).toBeUndefined();
  });
});
