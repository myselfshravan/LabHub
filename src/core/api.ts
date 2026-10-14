/**
 * Minimal same-origin GitLab REST client. Content-script fetches in MV3 carry the page's
 * session cookie, and GitLab authenticates cookie-based GET/HEAD API calls without a CSRF
 * token (lib/gitlab/auth/auth_finders.rb → verified_request?). Only reads are needed so far.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`GitLab API ${status} for ${path}`);
    this.name = 'ApiError';
  }
}

export interface GitLabApi {
  /** REST API: `get('projects/1/merge_requests/2')` → `/api/v4/projects/1/merge_requests/2`. */
  get<T>(path: string, init?: { signal?: AbortSignal }): Promise<T>;
  /**
   * GitLab's own page JSON (e.g. `group/proj/-/jobs/1.json`). Some of these work where the REST
   * API needs auth (job details are 401 for signed-out visitors via REST, 200 here).
   */
  getPageJson<T>(path: string, init?: { signal?: AbortSignal }): Promise<T>;
  /**
   * Total item count of a REST list endpoint (its `X-Total` header). Undefined when GitLab
   * omits it, which it does for very large result sets.
   */
  total(path: string, init?: { signal?: AbortSignal }): Promise<number | undefined>;
  /** `projects/:id` path segment for a project full path. */
  project(fullPath: string): string;
  group(fullPath: string): string;
}

export function createApi(origin: string): GitLabApi {
  const request = async (url: string, init: { signal?: AbortSignal }): Promise<Response> => {
    const res = await fetch(url, {
      credentials: 'same-origin',
      // We exist to fight staleness: never accept a cached answer.
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      signal: init.signal,
    });
    if (!res.ok) throw new ApiError(res.status, url.slice(origin.length));
    return res;
  };
  const getJson = async <T>(url: string, init: { signal?: AbortSignal }): Promise<T> =>
    (await (await request(url, init)).json()) as T;
  const strip = (path: string) => path.replace(/^\//, '');
  return {
    get: (path, init = {}) => getJson(`${origin}/api/v4/${strip(path)}`, init),
    getPageJson: (path, init = {}) => getJson(`${origin}/${strip(path)}`, init),
    total: async (path, init = {}) => {
      const res = await request(`${origin}/api/v4/${strip(path)}`, init);
      void res.body?.cancel();
      const n = Number(res.headers.get('x-total'));
      return res.headers.has('x-total') && Number.isFinite(n) ? n : undefined;
    },
    project: (p) => `projects/${encodeURIComponent(p)}`,
    group: (p) => `groups/${encodeURIComponent(p)}`,
  };
}
