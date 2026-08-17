export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError((data as { code?: string }).code ?? 'request_failed', response.status);
  return data as T;
}
export const api = {
  createRoom: (body: unknown) =>
    request<{ slug: string }>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  joinRoom: (slug: string, body: unknown) =>
    request<{ ok: true }>(`/api/rooms/${encodeURIComponent(slug)}/join`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  status: (slug: string) =>
    request<{ authenticated: boolean; role?: 'host' | 'guest'; displayName?: string }>(
      `/api/rooms/${encodeURIComponent(slug)}/status`,
    ),
  leave: (slug: string) =>
    request(`/api/rooms/${encodeURIComponent(slug)}/leave`, { method: 'POST' }),
  end: (slug: string) => request(`/api/rooms/${encodeURIComponent(slug)}/end`, { method: 'POST' }),
  clear: (slug: string) =>
    request(`/api/rooms/${encodeURIComponent(slug)}/clear-board`, { method: 'POST' }),
  turn: (slug: string) =>
    request<{ iceServers: RTCIceServer[] }>(
      `/api/rooms/${encodeURIComponent(slug)}/turn-credentials`,
    ),
};
