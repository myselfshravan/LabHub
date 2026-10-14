import { describe, expect, it } from 'vitest';
import { parsePage } from './page';

const body = (page = '') => ({ dataset: { page } }) as unknown as HTMLElement;
const parse = (path: string, page = '') =>
  parsePage(new URL(`https://gitlab.com${path}`), body(page));

describe('parsePage', () => {
  it.each([
    ['/org/repo/-/merge_requests/42', 'mr', 42],
    ['/org/sub/repo/-/merge_requests/42/diffs', 'mr', 42],
    ['/org/repo/-/merge_requests', 'mr-list', undefined],
    ['/org/repo/-/issues/7', 'issue', 7],
    ['/org/repo/-/work_items/7', 'issue', 7],
    ['/org/repo/-/issues', 'issue-list', undefined],
    ['/org/repo/-/pipelines/123', 'pipeline', 123],
    ['/org/repo/-/pipelines/123/builds', 'pipeline', 123],
    ['/org/repo/-/pipelines', 'pipeline-list', undefined],
    ['/org/repo/-/jobs/99', 'job', 99],
    ['/org/repo/-/blob/main/README.md', 'code', undefined],
    ['/org/repo/-/settings/ci_cd', 'other', undefined],
  ])('%s → %s', (path, kind, id) => {
    const p = parse(path);
    expect(p.kind).toBe(kind);
    expect(p.id).toBe(id);
    expect(p.scope?.type).toBe('project');
  });

  it('extracts nested project path', () => {
    expect(parse('/a/b/c/-/merge_requests/1').scope?.fullPath).toBe('a/b/c');
  });

  it('recognizes group lists via /groups/ prefix and data-page', () => {
    expect(parse('/groups/acme/-/merge_requests').scope).toEqual({
      type: 'group',
      fullPath: 'acme',
    });
    const p = parse('/acme/-/issues', 'groups:issues:index');
    expect(p.kind).toBe('issue-list');
    expect(p.scope?.type).toBe('group');
  });

  it('handles dashboard pages', () => {
    expect(parse('/dashboard/todos').kind).toBe('todos');
    expect(parse('/dashboard/merge_requests').scope?.type).toBe('dashboard');
  });

  it('detects project home from data-page', () => {
    expect(parse('/org/repo', 'projects:show')).toMatchObject({
      kind: 'project',
      scope: { fullPath: 'org/repo' },
    });
  });

  it('page key ignores hash but keeps query', () => {
    const a = parsePage(new URL('https://gitlab.com/o/r/-/merge_requests/1?x=1#note_5'), body());
    expect(a.key).toBe('https://gitlab.com/o/r/-/merge_requests/1?x=1');
  });
});
