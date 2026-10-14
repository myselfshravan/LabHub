# Changelog

## 0.1.0

First release.

- **Freshness:** detects stale MR, issue, list and to-do pages via API fingerprints; reloads
  on return when nothing would be lost, otherwise shows a banner. CI status in tab titles,
  desktop notifications when CI finishes or an MR is merged/approved, idle-aware polling.
- **GitHub look:** GitLab's palette replaced with GitHub's Primer colors; GitHub buttons,
  tabs, counters, labels, lists, state pills, comment cards and diff colors.
- **GitHub layout:** sidebar behind ☰, repo header with Code / Issues / Merge requests /
  Pipelines tabs and counts, state icons in lists, diffstat squares.
- **Short tab titles** led by the repo name, and **⌘K / Ctrl+K** for GitLab's search.
