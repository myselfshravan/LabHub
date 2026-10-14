/**
 * Every GitLab DOM selector the extension depends on, in one place. When GitLab ships a UI
 * change, this is the file to fix. Prefer data-testid / ids over classes; list fallbacks
 * comma-separated (newest first).
 */
export const SEL = {
  /** Top bar "Search or go to…" button (opens GitLab's command palette). */
  searchButton: '[data-testid="super-topbar-search-button"], #super-sidebar-search',
  /** Title link of each row in MR/issue/work-item lists. */
  listItemLink: '[data-testid="issuable-title-link"]',
  /** List sort control: label of the active sort field, and the direction toggle. */
  listSortLabel: '.sort-dropdown-container',
  listSortDirection: 'button[aria-label^="Sort direction"]',
  /** GitLab's paneled layout scrolls this element instead of the window. */
  scrollPanel: '.js-static-panel-inner',
  /** Title <h1> of an MR (classic) or issue (work item) page. */
  detailTitle: '[data-testid="title-content"], [data-testid="work-item-title"]',
} as const;
