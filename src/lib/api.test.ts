import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The API client's job is to attach the live session's Bearer token to every
 * call and to surface the API's own error code. Both are mocked at the boundary
 * — supabase-js for the session, global fetch for the wire — so this runs with
 * no network and no Supabase.
 */

// Hoisted so the vi.mock factory (itself hoisted to the top of the module) can
// reference it without a temporal-dead-zone error.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession } },
}));

// Imported after the mock is registered.
import { ApiError, getMe, sources } from './api';

function mockFetchOnce(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe('apiFetch auth', () => {
  it('attaches the session access token as a Bearer header', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
    const fetchSpy = mockFetchOnce(200, { customerId: 'c1', businessName: 'Salon', createdAt: 'x', detectionSettings: {} });

    await getMe();

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/me');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer jwt-123');
  });

  it('fails as missing_token when there is no session, without calling fetch', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(getMe()).rejects.toMatchObject({ code: 'missing_token', status: 401 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces the API error code on a non-2xx', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
    mockFetchOnce(404, { error: { code: 'not_found', message: 'Not found.' } });

    // One call, captured once: the mock is a single-shot, and asserting the
    // promise twice would fire a second unmocked fetch.
    const err = await sources.get('missing').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('sends a JSON body with content-type on create', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
    const fetchSpy = mockFetchOnce(200, { id: 's1', label: 'Form' });

    await sources.create('Form');

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/sources');
    expect(init!.method).toBe('POST');
    expect(init!.body).toBe(JSON.stringify({ label: 'Form' }));
    expect((init!.headers as Record<string, string>)['content-type']).toBe('application/json');
  });
});
