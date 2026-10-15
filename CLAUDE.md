# LabHub — notes for Claude

Chrome MV3 extension that makes GitLab **look and feel like GitHub** and **never show stale
status**. Public repo: https://github.com/myselfshravan/LabHub (local folder is still named
`better-gitlab`; the product was renamed to LabHub). Owner: Shravan (GitHub `myselfshravan`).

## What the owner cares about (read first)

- **GitHub likeness is the headline.** GitLab must look like GitHub, not "GitLab with GitHub
  colors". Judge every visual change against real github.com side by side — read GitHub's actual
  CSS values from a live GitHub page (e.g. `--diffBlob-*`, `--fgColor-*` tokens) instead of
  guessing. A thin token swap was once shipped as "GitHub look" and rightly called out.
- **Dark mode only** matters. Light mode should not break, but verify and tune in dark.
- **Staleness** (MR/pipeline/approval status going out of date) was the original problem;
  the freshness feature handles it. Keep it working.
- Every feature toggleable (popup), plus a master switch.
- README screenshots: stacked vertically, from a project with few labels
  (`fdroid/fdroidclient` works well; `gitlab-org/gitlab` has far too many labels).
- Brag line in the README ("Built end to end in a single Claude Code session") stays.

## Stack and commands

WXT 0.21 · TypeScript 6 (TS 7 breaks typescript-eslint; Dependabot ignores TS majors) ·
Vitest + happy-dom · ESLint flat config · Prettier. Node 24 (`.nvmrc`).

```sh
npm run check   # prettier is separate: npx prettier --check .  (CI runs both)
npm run build   # .output/chrome-mv3  (user loads this unpacked; must click reload on chrome://extensions)
npm run dev     # .output/chrome-mv3-dev with hot reload (don't load both)
npm run zip     # .output/labhub-<version>-chrome.zip
```

Release: bump `version` in package.json, update CHANGELOG.md, tag `vX.Y.Z`, push the tag →
`.github/workflows/release.yml` checks the tag matches package.json and attaches the zip.
CI (`ci.yml`) uploads the zip as an artifact (needs `include-hidden-files: true` — `.output` is
a dot-dir).

## Architecture

```
src/core/      settings (sync:settings, deep-merged defaults) · logger ([BGL:ns], warn/error only
               for real breakage — they show on chrome://extensions) · log-store · page.ts
               (parsePage → kind/scope/id; detail sub-tabs share one key) · api.ts (same-origin
               GET /api/v4 with session cookie, no-store; total() reads X-Total) · registry
               (starts/stops features per page key + settingsKey, error-isolated, injects css)
               · title.ts (single owner of document.title: prefix + rewrite) · selectors.ts ·
               octicons.ts (MIT Octicons paths) · hosts.ts (self-hosted via optional host perms)
src/features/  freshness · github-theme · github-layout · command-palette · tab-titles
src/entrypoints/ content.ts · background.ts (log sink, notifications, host sync) · popup · options
```

Feature contract: `defineFeature({ id, title, description, defaultOn, matches?, css?,
settingsKey?, init(ctx) })`; ctx = `{ page, settings, api, log, signal, onCleanup }`. Anything
added to the page must be removed on cleanup. Register in `src/features/index.ts`.

### freshness

API "fingerprints" per page kind (fingerprint.ts). MR: state/draft/sha/pipeline/notes/conflicts/
approvals (NOT `detailed_merge_status` — it flaps). Project lists: rendered row iids + newest
item; group/dashboard lists: same query in the page's own sort (group iid lookups 408).
Jobs via page JSON (`/-/jobs/:id.json`; REST is 401 signed-out). Triggers: return to tab →
auto-reload only if safe (safety.ts: no typed text/dialog/selection), else banner; visible
polling → banner only; idle (no input ≥ idleAfterSec) pauses polling and next input counts as
returning; offline/backoff skip background checks. Pipeline/job pages are live already: title
status only. Hidden CI tabs refresh title every 60s. Desktop notifications (notify.ts →
background) on CI finish / merged / closed / new approval while not looking. Scroll restore.

### github-theme (theme.css, pure CSS)

Layer 1: GitLab palette (`--gl-color-neutral/blue/green/red/purple/orange-*`) replaced with
Primer; separate neutral ladder for `html.gl-dark:root` (GitLab dark reads bg from 950, border
700, text 50). Layer 2: semantic tokens (buttons, radii 6px, tab underline coral, neutral badge
= GitHub Counter `#2f3742`, success/danger text `#3fb950`/`#f85149`). Layer 3: components —
boxed lists, label pills, state pills (`.bgl-state-badge`), title sizes, comment cards, MR
description card, diffs (Rapid Diffs `rd-*` classes + classic `.line_holder`; GitLab diff vars
`--code-new/old-diff-*`; hunk band `#388bfd1a` + navy `#0c2d6b` expander; GitHub dark syntax
colors on Rouge classes), flat page frame. `html:root` / `html.gl-dark:root` out-rank GitLab.

### github-layout

Sidebar hidden by default on all pages; ☰ injected in `.super-topbar > div` toggles
`html.bgl-sidebar-open` (docks back into GitLab's grid column — never overlay; remembered in
localStorage `bgl:sidebar-open`). Closed state overrides `.layout-page` grid to
`0 minmax(0,1fr) auto auto`. Project pages: repo header (owner / repo, visibility, Star/Fork
counts linking to starrers/forks) + tabs Code/Issues/Merge requests/Pipelines(/Wiki/Settings
if the sidebar has those links) with counts; mounted at top of `.js-static-panel-inner`;
breadcrumb bar hidden unless it holds actions. Title gets muted `!123`/`#123`. List rows get
`data-bgl-state` (open/draft/merged/closed) → colored Octicon via CSS mask. Diffstat squares
appended to `.rd-diff-file-stats` / `.diff-stats-contents`. Pure logic in model.ts (tested).

## Verifying visual changes live (the reliable loop)

The installed extension can't be reloaded from here, and gitlab.com's CSP blocks fetching from
localhost. What works with Claude-in-Chrome:

1. Bundle the real feature code as an IIFE with vite (config + entry in the scratchpad):
   entry = createRegistry([theme, layout], createApi(location.origin), createLogger('preview'))
   .sync(parsePage(new URL(location.href), document.body), DEFAULT_SETTINGS), after removing
   the installed extension's `style[data-bgl=…]`, `[data-bgl="repo-header"]`, `.bgl-menu-btn`.
   Vite config must not `import 'vite'` (run from scratchpad); use alias `@` → repo `src`,
   `build.lib` iife, `minify: true`.
2. Inject an `<input type=file>` on the page, `find` it, `file_upload` the bundle, `eval` its text
   (eval works from the tool). Keep it in sessionStorage to re-eval after navigation; clean up
   any localStorage keys afterwards.
3. Screenshot in dark mode (`gl-dark` on `<html>`). Tool output containing `?`/`&`/`=` patterns
   can get blocked — sanitize strings in JS before returning.

## Conventions

- No hacks: GitLab hooks via `data-testid`, stable classes, design tokens; selectors in
  `core/selectors.ts` when shared. Read-only API (GET only). Neutral example names in
  tests/docs (never employer names).
- Commit locally freely; **ask before pushing / tags / PRs**. Commits end with
  `Co-Authored-By: Claude …` per the session's attribution rules.
- Known follow-ups: Dependabot PRs #1–#3 (actions v7) are superseded by main; GitLab tab names
  were deliberately not renamed (Overview stays Overview).
