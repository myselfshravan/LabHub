import { describe, expect, it } from 'vitest';
import { parsePage } from '@/core/page';
import { createApi } from '@/core/api';
import { openCountPath, shortTitle } from './index';

const page = (path: string, dataPage = '') =>
  parsePage(new URL(`https://gitlab.com${path}`), {
    dataset: { page: dataPage },
  } as unknown as HTMLElement);
const P = 'Acme / experiments / web-app';

describe('shortTitle', () => {
  it.each([
    ['/c/e/web-app/-/merge_requests', `Merge requests · ${P} · GitLab`, 'web-app · MRs'],
    ['/c/e/web-app/-/issues', `Issues · ${P} · GitLab`, 'web-app · Issues'],
    ['/c/e/web-app/-/pipelines', `Pipelines · ${P} · GitLab`, 'web-app · Pipelines'],
    [
      '/c/e/web-app/-/merge_requests/12',
      `Draft: Fix login (!12) · Merge requests · ${P} · GitLab`,
      'web-app !12 Draft: Fix login',
    ],
    [
      '/c/e/web-app/-/merge_requests/12/diffs',
      `Changes · Fix (login) (!12) · Merge requests · ${P} · GitLab`,
      'web-app !12 Fix (login)',
    ],
    [
      '/c/e/web-app/-/work_items/7',
      `Crash on boot (#7) · Work items · ${P} · GitLab`,
      'web-app #7 Crash on boot',
    ],
    ['/c/e/web-app/-/pipelines/99', `Pipeline #99 · ${P} · GitLab`, 'web-app · Pipeline #99'],
    ['/c/e/web-app/-/jobs/5', `rspec 1/2 (#5) · Jobs · ${P} · GitLab`, 'web-app · rspec 1/2'],
    [
      '/c/e/web-app/-/blob/main/README.md',
      `README.md · main · ${P} · GitLab`,
      'web-app · README.md',
    ],
  ])('%s', (path, title, want) => {
    expect(shortTitle(page(path), title)).toBe(want);
  });

  it('shortens project and group homes and group lists', () => {
    expect(shortTitle(page('/c/e/web-app', 'projects:show'), `${P} · GitLab`)).toBe('web-app');
    expect(
      shortTitle(page('/groups/acme/-/merge_requests'), 'Merge requests · Acme · GitLab'),
    ).toBe('acme · MRs');
  });

  it('leaves dashboard and unscoped pages alone', () => {
    expect(shortTitle(page('/dashboard/todos'), 'To-Do List · GitLab')).toBe('To-Do List · GitLab');
    expect(shortTitle(page('/explore'), 'Explore · GitLab')).toBe('Explore · GitLab');
  });
});

describe('open counts', () => {
  it('appends the open count to list titles', () => {
    expect(
      shortTitle(page('/c/e/web-app/-/merge_requests'), `Merge requests · ${P} · GitLab`, 3),
    ).toBe('web-app · MRs (3)');
    expect(shortTitle(page('/c/e/web-app/-/issues'), `Issues · ${P} · GitLab`, 0)).toBe(
      'web-app · Issues (0)',
    );
  });

  it('counts open items in the page scope only', () => {
    const api = createApi('https://gitlab.com');
    expect(openCountPath(page('/c/e/web-app/-/merge_requests'), api)).toBe(
      'projects/c%2Fe%2Fweb-app/merge_requests?state=opened&per_page=1',
    );
    expect(openCountPath(page('/groups/acme/-/issues'), api)).toBe(
      'groups/acme/issues?state=opened&per_page=1',
    );
    expect(openCountPath(page('/dashboard/merge_requests'), api)).toBeUndefined();
    expect(openCountPath(page('/c/e/web-app/-/merge_requests/3'), api)).toBeUndefined();
  });
});
