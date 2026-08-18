import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('API requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not label bodyless POST requests as JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await api.clear('demo-room');

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has('content-type')).toBe(false);
    expect(init.body).toBeUndefined();
  });

  it('sets JSON content type when a request has a body', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slug: 'demo-room' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await api.createRoom({ displayName: 'Araz' });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });
});
