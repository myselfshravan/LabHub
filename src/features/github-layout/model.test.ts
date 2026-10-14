import { describe, expect, it } from 'vitest';
import { parsePage } from '@/core/page';
import { activeTab, availableTabs, repoTabs, rowState, shortCount } from './model';

const page = (path: string, dataPage = '') =>
  parsePage(new URL(`https://gitlab.com${path}`), { dataset: { page: dataPage } });

describe('repo tabs', () => {
  const tabs = repoTabs('acme/web/app');

  it('links every tab under the project', () => {
    expect(tabs.map((t) => t.href)).toEqual([
      '/acme/web/app',
      '/acme/web/app/-/issues',
      '/acme/web/app/-/merge_requests',
      '/acme/web/app/-/pipelines',
      '/acme/web/app/-/wikis/home',
      '/acme/web/app/edit',
    ]);
  });

  it('keeps only tabs the sidebar offers', () => {
    const sidebar = ['/acme/web/app/-/merge_requests', '/acme/web/app/-/work_items', '/x/-/wikis'];
    expect(availableTabs(tabs, sidebar).map((t) => t.id)).toEqual(['code', 'issues', 'mrs']);
    expect(availableTabs(tabs, []).map((t) => t.id)).toEqual(['code', 'mrs', 'pipelines']);
  });

  it('marks the active tab', () => {
    expect(activeTab(page('/acme/app/-/merge_requests/3/diffs'))).toBe('mrs');
    expect(activeTab(page('/acme/app/-/issues'))).toBe('issues');
    expect(activeTab(page('/acme/app/-/jobs/9'))).toBe('pipelines');
    expect(activeTab(page('/acme/app/-/tree/main'))).toBe('code');
    expect(activeTab(page('/acme/app', 'projects:show'))).toBe('code');
    expect(activeTab(page('/acme/app/-/branches'))).toBe('code');
    expect(activeTab(page('/acme/app/-/wikis/home'))).toBe('wiki');
    expect(activeTab(page('/acme/app/-/settings/ci_cd'))).toBe('settings');
    expect(activeTab(page('/acme/app/-/project_members'))).toBeUndefined();
  });
});

describe('shortCount', () => {
  it('abbreviates like GitHub', () => {
    expect([0, 999, 1000, 1234, 9999, 12345].map(shortCount)).toEqual([
      '0',
      '999',
      '1k',
      '1.2k',
      '9.9k',
      '12k',
    ]);
  });
});

describe('rowState', () => {
  it('follows the state tab, then the row', () => {
    expect(rowState('merged', 'x', '')).toBe('merged');
    expect(rowState('closed', 'x', '')).toBe('closed');
    expect(rowState('all', 'x', 'Merged 2 days ago')).toBe('merged');
    expect(rowState('all', 'x', 'Closed')).toBe('closed');
    expect(rowState(null, 'Draft: tidy', '')).toBe('draft');
    expect(rowState('opened', '[Draft] tidy', '')).toBe('draft');
    expect(rowState(null, 'Fix draft mode', '')).toBe('open');
  });
});
