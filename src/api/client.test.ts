import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setFetch, setUnauthorizedHandler } from './client';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => setUnauthorizedHandler(null));

describe('api client', () => {
  it('prefixes /api/v1, sends JSON and serialises the query', async () => {
    const f = vi.fn().mockImplementation(async () => json(200, { data: [] }));
    setFetch(f);
    await request('GET', '/projects', { query: { teamId: 't1', archived: false, q: undefined } });
    expect(f).toHaveBeenCalledWith('/api/v1/projects?teamId=t1&archived=false', expect.objectContaining({ credentials: 'include' }));
    await request('POST', '/tasks', { body: { title: 'x' } });
    expect(f.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"title":"x"}' });
  });

  it('maps the error envelope to ApiError', async () => {
    setFetch(async () => json(404, { error: { code: 'NOT_FOUND', message: 'nope' } }));
    await expect(request('GET', '/tasks/1')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'nope' });
  });

  it('returns undefined for 204', async () => {
    setFetch(async () => new Response(null, { status: 204 }));
    await expect(request('DELETE', '/tasks/1')).resolves.toBeUndefined();
  });

  it('fires the unauthorized handler on 401 outside /auth', async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    setFetch(async () => json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }));
    await expect(request('GET', '/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauth).not.toHaveBeenCalled();
    await expect(request('GET', '/projects')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });
});
