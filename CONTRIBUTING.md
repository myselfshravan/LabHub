# Contributing

Thanks for helping make GitLab feel like GitHub.

```sh
npm install
npm run dev     # builds .output/chrome-mv3-dev; load it unpacked, it hot-reloads
npm run check   # lint + typecheck + tests (what CI runs)
```

- Every feature lives in `src/features/<id>/` and is registered in `src/features/index.ts`.
  It must clean up after itself (the registry tears features down on navigation and toggle-off).
- GitLab selectors go in `src/core/selectors.ts` or next to the feature that owns them; prefer
  `data-testid` and GitLab's design tokens (`--gl-*`) over layout classes.
- Visual changes: attach a before/after screenshot to the PR.
- Keep it read-only: LabHub only issues `GET` requests to GitLab.
