# Better GitLab

A personal Chrome extension that fixes GitLab's biggest annoyance — **stale pages** — and,
step by step, makes GitLab feel more like GitHub.

## What it does

### Keep pages fresh (`freshness`)
GitLab renders most of a page once; come back to a tab later and the MR status, pipeline,
approvals or list you're looking at may be out of date. Better GitLab takes a cheap API
"fingerprint" of what the page shows and re-checks it:

| Trigger | What happens on a change |
| --- | --- |
| You return to the tab (away ≥ 5 s) | Reloads automatically **if nothing would be lost**, else shows a banner |
| Back/forward cache restore, network back online | Same as above |
| Every 30 s while the tab is visible | Shows a "This page has updates · Reload" banner (never yanks the page while you read) |

"Nothing would be lost" means: no typed text in a comment box or field, no focused input,
no open editor/dialog, no text selection. Scroll position is restored after a reload.

What's watched:

| Page | Change detected |
| --- | --- |
| MR | new commits, pipeline status / new pipeline, comments, approvals, state, draft, conflicts |
| Issue / work item | state, comments, any update |
| Project MR / issue list | any row on screen updated, or a new item matching your filters |
| Group / dashboard list | the same rows in the page's own sort order |
| To-Do list | pending to-dos |
| Pipeline, job, pipeline list | nothing to do: GitLab live-updates these itself; only the tab title is kept current |
| Anything else (code, settings…) | no detection; reloads on return after 5 minutes away |

MR, pipeline and job tabs show the CI status in the tab title (✅ ❌ 🔄 ⏳ ⚠️), refreshed once a
minute while the tab is in the background, so you can watch a pipeline from another tab.

### GitHub look (`github-theme`)
GitHub Primer colors (light + dark) and system fonts, applied by retargeting GitLab's own
`--gl-*` design tokens rather than restyling components, so it survives GitLab UI updates.

### ⌘K / Ctrl+K (`command-palette`)
Opens GitLab's "Search or go to…" palette (supports `>` commands, `@` users, `:` projects).
Ignored inside editors, where GitLab uses ⌘K to insert a link.

GitLab already has the other GitHub shortcuts natively, so they aren't duplicated: `t` file
finder, `y` permalink, `?` shortcut list, `[`/`]` previous/next file and the **Viewed** checkbox in MR diffs.

Every feature can be toggled from the toolbar popup, and there's a master on/off switch.
Settings → intervals, auto-reload vs banner-only, self-hosted instances, logs.

## Install (load unpacked)

```sh
npm install
npm run build          # → .output/chrome-mv3
```

Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select `.output/chrome-mv3`. After a rebuild, hit the reload icon on the extension card.

For development, `npm run dev` builds `.output/chrome-mv3-dev`; load that folder instead and it
hot-reloads on every change (keep `npm run dev` running). Don't load both at once.

### Self-hosted GitLab
Open your instance, click the extension icon → **Enable on <host>** (or add it in Settings).
Chrome asks for permission for that origin only; the content script is then registered for it.

## Development

```sh
npm run check    # lint + typecheck + tests
npm test         # vitest (happy-dom)
```

```
src/
  core/        settings, logger + log store, page detection, API client, feature registry, hosts
  features/    one folder per feature (index.ts = defineFeature, plus its modules and tests)
  entrypoints/ content script, background worker, popup, options
```

A feature is `defineFeature({ id, title, description, defaultOn, matches?, css?, settingsKey?, init })`.
`init` gets `{ page, settings, api, log, signal, onCleanup }`; the registry starts it on matching
pages and tears it down on navigation, toggle-off or relevant settings changes. Register new
features in `src/features/index.ts`.

### Logs
Everything logs as `[BGL:<namespace>]` in the page console (debug level only when **Debug
logging** is on). All levels are buffered (last 1000) and viewable/exportable in Settings → Logs.

## How it talks to GitLab
Read-only `GET /api/v4/...` from the page's own origin with your existing session cookie —
no tokens, nothing leaves your browser.
