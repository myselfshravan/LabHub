import { afterEach, describe, expect, it } from 'vitest';
import { tabTitle } from './title';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  tabTitle.setPrefix('');
  tabTitle.setRewrite(undefined);
});

describe('tabTitle', () => {
  it('composes prefix + rewrite and hands the title back when cleared', () => {
    document.title = 'MRs · Acme / app · GitLab';
    tabTitle.setRewrite((t) => t.toUpperCase());
    tabTitle.setPrefix('✅ ');
    expect(document.title).toBe('✅ MRS · ACME / APP · GITLAB');
    tabTitle.setRewrite(undefined);
    expect(document.title).toBe('✅ MRs · Acme / app · GitLab');
    tabTitle.setPrefix('');
    expect(document.title).toBe('MRs · Acme / app · GitLab');
  });

  it("re-applies on top of GitLab's new title after in-page navigation", async () => {
    document.title = 'Overview';
    tabTitle.setRewrite((t) => `app · ${t}`);
    expect(document.title).toBe('app · Overview');
    document.title = 'Changes'; // GitLab switches MR tab
    await flush();
    expect(document.title).toBe('app · Changes');
  });

  it('never blanks the title if a rewrite throws', () => {
    document.title = 'Original';
    tabTitle.setRewrite(() => {
      throw new Error('boom');
    });
    expect(document.title).toBe('Original');
  });
});
