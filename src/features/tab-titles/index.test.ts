import { describe, expect, it } from 'vitest';
import { parsePage } from '@/core/page';
import { shortTitle } from './index';

const page = (path: string, dataPage = '') =>
  parsePage(new URL(`https://gitlab.com${path}`), {
    dataset: { page: dataPage },
  } as unknown as HTMLElement);
const P = 'ConfidoHealth / experiments / agent-os-ui';

describe('shortTitle', () => {
  it.each([
    ['/c/e/agent-os-ui/-/merge_requests', `Merge requests · ${P} · GitLab`, 'agent-os-ui · MRs'],
    ['/c/e/agent-os-ui/-/issues', `Issues · ${P} · GitLab`, 'agent-os-ui · Issues'],
    ['/c/e/agent-os-ui/-/pipelines', `Pipelines · ${P} · GitLab`, 'agent-os-ui · Pipelines'],
    [
      '/c/e/agent-os-ui/-/merge_requests/12',
      `Draft: Fix login (!12) · Merge requests · ${P} · GitLab`,
      'agent-os-ui !12 Draft: Fix login',
    ],
    [
      '/c/e/agent-os-ui/-/merge_requests/12/diffs',
      `Changes · Fix (login) (!12) · Merge requests · ${P} · GitLab`,
      'agent-os-ui !12 Fix (login)',
    ],
    [
      '/c/e/agent-os-ui/-/work_items/7',
      `Crash on boot (#7) · Work items · ${P} · GitLab`,
      'agent-os-ui #7 Crash on boot',
    ],
    [
      '/c/e/agent-os-ui/-/pipelines/99',
      `Pipeline #99 · ${P} · GitLab`,
      'agent-os-ui · Pipeline #99',
    ],
    [
      '/c/e/agent-os-ui/-/jobs/5',
      `rspec 1/2 (#5) · Jobs · ${P} · GitLab`,
      'agent-os-ui · rspec 1/2',
    ],
    [
      '/c/e/agent-os-ui/-/blob/main/README.md',
      `README.md · main · ${P} · GitLab`,
      'agent-os-ui · README.md',
    ],
  ])('%s', (path, title, want) => {
    expect(shortTitle(page(path), title)).toBe(want);
  });

  it('shortens project and group homes and group lists', () => {
    expect(shortTitle(page('/c/e/agent-os-ui', 'projects:show'), `${P} · GitLab`)).toBe(
      'agent-os-ui',
    );
    expect(
      shortTitle(page('/groups/acme/-/merge_requests'), 'Merge requests · Acme · GitLab'),
    ).toBe('acme · MRs');
  });

  it('leaves dashboard and unscoped pages alone', () => {
    expect(shortTitle(page('/dashboard/todos'), 'To-Do List · GitLab')).toBe('To-Do List · GitLab');
    expect(shortTitle(page('/explore'), 'Explore · GitLab')).toBe('Explore · GitLab');
  });
});
