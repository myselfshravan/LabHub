/**
 * Works out what kind of GitLab page we're on. Primary source is the URL path (it stays
 * correct across GitLab's in-page pushState navigation); `body[data-page]` and the
 * `data-project*` / `data-group*` attributes only fill in scope details.
 */

export type PageKind =
  | 'mr'
  | 'mr-list'
  | 'issue'
  | 'issue-list'
  | 'pipeline'
  | 'pipeline-list'
  | 'job'
  | 'todos'
  | 'code'
  | 'project'
  | 'other';

export interface Scope {
  type: 'project' | 'group' | 'dashboard';
  /** `group/sub/project` (empty for dashboard). */
  fullPath: string;
}

export interface PageContext {
  origin: string;
  /**
   * Identity of the loaded document: two contexts with the same key are the same page.
   * href without the hash, except detail pages, where sub-tabs share the base key.
   */
  key: string;
  pathname: string;
  search: URLSearchParams;
  /** `body[data-page]`, e.g. `projects:merge_requests:show`. May be stale after pushState. */
  dataPage: string;
  kind: PageKind;
  scope?: Scope;
  /** MR/issue iid, or pipeline/job id. */
  id?: number;
}

const ROUTES: Array<[RegExp, PageKind]> = [
  [/^merge_requests\/(\d+)(?:\/.*)?$/, 'mr'],
  [/^merge_requests\/?$/, 'mr-list'],
  [/^(?:issues|work_items)\/(\d+)(?:\/.*)?$/, 'issue'],
  [/^(?:issues|work_items)\/?$/, 'issue-list'],
  [/^pipelines\/(\d+)(?:\/.*)?$/, 'pipeline'],
  [/^pipelines\/?$/, 'pipeline-list'],
  [/^jobs\/(\d+)(?:\/.*)?$/, 'job'],
  [/^(?:blob|tree|blame|commits?|raw)\/.*$/, 'code'],
];

export function parsePage(url: URL, body: Pick<HTMLElement, 'dataset'> | null): PageContext {
  const dataPage = body?.dataset.page ?? '';
  const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
  const base = {
    origin: url.origin,
    key: url.origin + url.pathname + url.search,
    pathname,
    search: url.searchParams,
    dataPage,
  };

  if (pathname === '/dashboard/todos') return { ...base, kind: 'todos' };
  const dash = /^\/dashboard\/(merge_requests|issues)$/.exec(pathname);
  if (dash) {
    return {
      ...base,
      kind: dash[1] === 'merge_requests' ? 'mr-list' : 'issue-list',
      scope: { type: 'dashboard', fullPath: '' },
    };
  }

  // Everything project/group scoped lives under `<namespace path>/-/<rest>`.
  const sep = pathname.indexOf('/-/');
  if (sep > 0) {
    let ns = pathname.slice(1, sep);
    const rest = pathname.slice(sep + 3);
    const isGroup = ns.startsWith('groups/') || dataPage.startsWith('groups:');
    if (ns.startsWith('groups/')) ns = ns.slice('groups/'.length);
    const scope: Scope = { type: isGroup ? 'group' : 'project', fullPath: ns };
    for (const [re, kind] of ROUTES) {
      const m = re.exec(rest);
      if (!m) continue;
      // Group pages only have lists; a group "MR 12" URL doesn't exist.
      if (isGroup && !kind.endsWith('-list')) break;
      if (!m[1]) return { ...base, kind, scope };
      // In-page sub-tabs (MR Changes/Commits, pipeline Jobs/Tests, ...) are pushState
      // navigations of the same document: key them as one page so features keep their state.
      const resource = rest.slice(0, rest.indexOf('/'));
      const key = `${url.origin}/${pathname.slice(1, sep)}/-/${resource}/${m[1]}`;
      return { ...base, key, kind, scope, id: Number(m[1]) };
    }
    return { ...base, kind: 'other', scope };
  }

  if (dataPage === 'projects:show') {
    return { ...base, kind: 'project', scope: { type: 'project', fullPath: pathname.slice(1) } };
  }
  return { ...base, kind: 'other' };
}

/** True when the document looks like a GitLab page (used to bail out on non-GitLab hosts). */
export function isGitLabDocument(doc: Document): boolean {
  return (
    !!doc.querySelector('meta[property="og:site_name"][content="GitLab"]') ||
    (!!doc.body?.dataset.page && !!doc.querySelector('meta[name="csrf-token"]'))
  );
}
