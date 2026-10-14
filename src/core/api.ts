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
  get<T>(path: string, init?: { signal?: AbortSignal }): Promise<T>;
  /** `projects/:id` path segment for a project full path. */
  project(fullPath: string): string;
  group(fullPath: string): string;
}

export function createApi(origin: string): GitLabApi {
  return {
    async get<T>(path: string, init: { signal?: AbortSignal } = {}): Promise<T> {
      const res = await fetch(`${origin}/api/v4/${path.replace(/^\//, '')}`, {
        credentials: 'same-origin',
        // We exist to fight staleness: never accept a cached answer.
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        signal: init.signal,
      });
      if (!res.ok) throw new ApiError(res.status, path);
      return (await res.json()) as T;
    },
    project: (p) => `projects/${encodeURIComponent(p)}`,
    group: (p) => `groups/${encodeURIComponent(p)}`,
  };
}
