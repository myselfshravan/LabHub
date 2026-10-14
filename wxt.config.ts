import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Better GitLab',
    description:
      'Keeps GitLab pages fresh (no more stale MR/pipeline status) and adds GitHub-like UX.',
    // `scripting` + optional hosts let users enable self-hosted GitLab instances at runtime.
    permissions: ['storage', 'scripting', 'activeTab'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'Better GitLab' },
  },
});
