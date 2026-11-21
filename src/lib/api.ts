// In-memory Bearer token (never persisted in localStorage/sessionStorage per security guidelines;
// httpOnly cookie 'cc_token' maintains session across reloads automatically).
let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const errObj = data?.error || {};
    throw new ApiError(
      res.status,
      errObj.code || 'API_ERROR',
      errObj.message || `Request failed with status ${res.status}`
    );
  }

  return data as T;
}
