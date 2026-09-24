import { supabase } from './supabase';

/**
 * The typed client for our own serverless API.
 *
 * One place attaches the `Authorization: Bearer <jwt>` header, so no screen ever
 * forgets it and no token is read from anywhere but the live Supabase session.
 * The token is fetched per call rather than cached: supabase-js refreshes it in
 * the background, and reading it fresh means we never send a just-expired one.
 *
 * The API is same-origin in production (Vercel serves `/api/*` alongside the
 * SPA), so the base is the relative `/api`. `VITE_API_BASE_URL` can override it
 * for a split deploy, but is not required.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '') + '/api';

/**
 * The wire shape returned by the provisioning routes.
 *
 * Deliberately re-declared here rather than imported from `api/_lib/sources.ts`:
 * that module is server-only and outside the web tsconfig, and importing it would
 * drag `process.env`-reading code into the browser bundle. This interface is the
 * client's copy of the same contract; `api/__tests__/sources.test.ts` guards the
 * server side of it.
 */
export interface SourceResponse {
  id: string;
  label: string;
  kind: 'webhook' | 'email' | 'csv';
  /** Null once revoked. Carries the full token — it is a value to copy, not a secret to hide. */
  webhookUrl: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastEventAt: string | null;
  eventCount: number;
  leadCount: number;
  previousTokenInUse: boolean;
  lastParseWarningAt: string | null;
}

export interface MeResponse {
  customerId: string;
  businessName: string;
  createdAt: string;
  detectionSettings: unknown;
}

/**
 * A failed request, carrying the API's own error code.
 *
 * The API's envelope is `{ error: { code, message } }` (`api/_lib/response.ts`).
 * Surfacing `code` lets a screen branch on `not_found` vs `rate_limited` without
 * string-matching a human message.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    // No live session: fail as the API would, so callers handle one error shape.
    throw new ApiError(401, 'missing_token', 'Not signed in.');
  }

  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      authorization: `Bearer ${session.access_token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const code = body?.error?.code ?? 'error';
    const message = body?.error?.message ?? `Request failed (${res.status}).`;
    throw new ApiError(res.status, code, message);
  }

  return body as T;
}

/** Prove the session resolves to a tenant — the first call after sign-in. */
export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/me');
}

export const sources = {
  list: () => apiFetch<SourceResponse[]>('/sources'),
  get: (id: string) => apiFetch<SourceResponse>(`/sources/${id}`),
  create: (label: string) =>
    apiFetch<SourceResponse>('/sources', { method: 'POST', body: JSON.stringify({ label }) }),
  rotate: (id: string) =>
    apiFetch<SourceResponse>(`/sources/${id}/rotate`, { method: 'POST' }),
  revoke: (id: string) => apiFetch<SourceResponse>(`/sources/${id}`, { method: 'DELETE' }),
};
