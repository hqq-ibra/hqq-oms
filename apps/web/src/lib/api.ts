const STORAGE_KEYS = {
  ACCESS_TOKEN: 'HQQ_ACCESS_TOKEN',
  REFRESH_TOKEN: 'HQQ_REFRESH_TOKEN',
  USER: 'HQQ_USER',
} as const;

function parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string, bufferMs = 60 * 1000): boolean {
  const exp = parseJwtExp(token);
  if (!exp) return true;
  return Date.now() >= exp - bufferMs;
}

async function refreshToken(): Promise<string | null> {
  const refreshToken = typeof window !== 'undefined'
    ? localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
    : null;
  if (!refreshToken) return null;

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const { accessToken, refreshToken: newRefresh, user } = data;

  if (typeof window !== 'undefined') {
    if (accessToken) localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    if (newRefresh) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);
    if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  return accessToken ?? null;
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  let token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  if (token && !isTokenExpired(token)) return token;

  token = await refreshToken();
  return token;
}

const baseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<T> {
  const { params, ...init } = options;
  let url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  if (params) {
    const search = new URLSearchParams(params).toString();
    url += (url.includes('?') ? '&' : '?') + search;
  }

  const token = await getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    const newToken = await refreshToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...init, headers });
    }
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Request failed: ${res.status}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  let url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const token = await getAuthToken();

  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { method: 'POST', headers, body: formData });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Upload failed: ${res.status}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string>) =>
    request<T>(path, { method: 'GET', params }),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),

  upload: <T>(path: string, formData: FormData) =>
    uploadFile<T>(path, formData),
};
