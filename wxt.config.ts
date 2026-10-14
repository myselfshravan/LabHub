import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  // `npm run dev` builds .output/chrome-mv3-dev and hot-reloads it in whatever Chrome profile
  // loaded it unpacked, instead of launching a separate throwaway browser.
  webExt: { disabled: true },
  manifest: {
    name: 'LabHub',
    homepage_url: 'https://github.com/myselfshravan/LabHub',
    description:
      'GitLab that looks and feels like GitHub, and never shows you stale MR or pipeline status.',
    // `scripting` + optional hosts let users enable self-hosted GitLab instances at runtime.
    // `notifications`: CI finished / MR merged while you're on another tab.
    permissions: ['storage', 'scripting', 'activeTab', 'notifications'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'LabHub' },
  },
});
