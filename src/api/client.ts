import { getWorkspaceId } from '@/workspace/workspaceId';
import type { ErrorBody, ErrorCode } from './types';

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike = (input, init) => fetch(input, init);
let onUnauthorized: (() => void) | null = null;

/** Swap the transport (used by the mock backend and tests). */
export function setFetch(f: FetchLike) {
  fetchImpl = f;
}

/** Called when any non-auth request returns 401 (session expired). */
let onWorkspaceLost: (() => void) | null = null;
/** Called when a workspace-scoped request 404s for this tab's workspace (access lost mid-session). */
export function setWorkspaceLostHandler(fn: (() => void) | null) {
  onWorkspaceLost = fn;
}

// SPEC §12 "Scoped" endpoints: collection paths only. A 404 from these with a header means the
// header's workspace is gone for us; ID-addressed endpoints (/admin/users/:id, /admin/invites/:id,
// …) 404 for their own resource instead.
const SCOPED = [/^\/users$/, /^\/admin\/(users|invites)$/, /^\/teams$/, /^\/projects$/, /^\/me\/tasks$/, /^\/tasks$/, /^\/notifications(\/read-all)?$/, /^\/search$/, /^\/goals(\/time-periods)?$/, /^\/reports\/(overview|workload)$/];
const isScoped = (path: string) => SCOPED.some((re) => re.test(path.split('?')[0]));

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query) {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export const WORKSPACE_HEADER = 'X-Workspace-Id';

/** Headers every request carries: the tab's workspace (SPEC §12), unless overridden per call. */
function baseHeaders(workspaceId?: string | null): Record<string, string> {
  const ws = workspaceId === undefined ? getWorkspaceId() : workspaceId;
  return ws ? { [WORKSPACE_HEADER]: ws } : {};
}

export type RequestOpts = {
  body?: unknown;
  query?: Query;
  /** Send a different workspace than the tab's (e.g. per-workspace unread counts); null = none. */
  workspaceId?: string | null;
};

export async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const headers = baseHeaders(opts.workspaceId);
  const init: RequestInit = { method, credentials: 'include', headers };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetchImpl(buildUrl(path, opts.query), init);
  } catch {
    throw new ApiError(0, 'INTERNAL', 'Network error — is the server running?');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }
  if (!res.ok) {
    // Only for the tab's own workspace: an explicit per-call workspace (rail unread probes) doesn't count.
    if (res.status === 404 && opts.workspaceId === undefined && headers[WORKSPACE_HEADER] && isScoped(path)) onWorkspaceLost?.();
    throw failure(path, res.status, json, res.statusText);
  }
  return json as T;
}

/** The ApiError for a failed response (and the session-expired handler on a 401). */
export function failure(path: string, status: number, json: unknown, statusText?: string): ApiError {
  const err = (json as ErrorBody | undefined)?.error;
  if (status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
  return new ApiError(
    status,
    err?.code ?? (status === 401 ? 'UNAUTHORIZED' : 'INTERNAL'),
    err?.message ?? statusText ?? 'Request failed',
    err?.details,
  );
}

/** `path` plus one query parameter, whether or not it already has a query string. */
export function withQuery(path: string, key: string, value: string) {
  return `${path}${path.includes('?') ? '&' : '?'}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

/** The current tab's headers, for transports other than `request` (uploads). */
export function requestHeaders(): Record<string, string> {
  return baseHeaders();
}

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export const http = {
  get: <T>(path: string, query?: Query, opts: Pick<RequestOpts, 'workspaceId'> = {}) =>
    request<T>('GET', path, { query, ...opts }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};

/** Fetch a non-JSON resource (e.g. a CSV export) through the configured transport. */
export async function requestBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetchImpl(`${API_BASE}${path}`, { method: 'GET', credentials: 'include', headers: baseHeaders() });
  if (!res.ok) throw new ApiError(res.status, res.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL', res.statusText || 'Download failed');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? null;
  return { blob: await res.blob(), filename };
}
