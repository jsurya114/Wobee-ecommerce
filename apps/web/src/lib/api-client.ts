/**
 * The ONLY thing that talks to apps/api (ARCHITECTURE.md §4.2) — every
 * feature's api/*.client.ts wraps this instead of calling fetch directly.
 * Always sends credentials so the httpOnly refresh cookie travels with
 * requests that need it (ADR-018). apps/web never imports @woobe/database
 * or queries Postgres directly, including from Server Components (ADR-019)
 * — this file, over HTTP, is the only path.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set — copy apps/web/.env.example to apps/web/.env.local (see comment there for why root .env isn't enough).",
    );
  }
  return url;
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  accessToken?: string;
  /** Internal — set only by apiFetch's own 401-retry below. Never pass this explicitly. */
  isRetryAfterRefresh?: boolean;
}

/**
 * Registered once by `AuthProvider` (never imported here directly — this
 * file stays generic/auth-agnostic, DI instead of a dependency edge) to
 * silently refresh an expired access token and hand back the new one.
 * Access tokens are short-lived (15 minutes, `JWT_ACCESS_TOKEN_TTL`) and
 * live only in memory, refreshed once on page load — without this, any
 * tab left open past that window starts throwing an uncaught 401 on the
 * very next authenticated call, even though the httpOnly refresh cookie
 * (30 days, `JWT_REFRESH_TOKEN_TTL`) is still perfectly valid. Returns the
 * fresh token to retry with, or `null` if refreshing itself failed (a
 * genuine logged-out state — the caller should surface the original 401).
 */
type UnauthorizedHandler = () => Promise<string | null>;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, accessToken, headers, isRetryAfterRefresh, ...rest } = options;

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  // An expired (not merely absent/wrong) access token on an authenticated
  // call — retry exactly once with a freshly-refreshed token before
  // treating this as a real error. Guarded so this never fires for a
  // guest call (no accessToken to have expired), a genuine 401 from
  // login/wrong-password (that request never carries an accessToken
  // either), or a loop (the retried call passes isRetryAfterRefresh, so
  // it falls straight through to the normal error path below even if it
  // 401s again).
  if (res.status === 401 && accessToken && !isRetryAfterRefresh && onUnauthorized) {
    const freshToken = await onUnauthorized();
    if (freshToken) {
      return apiFetch<T>(path, { ...options, accessToken: freshToken, isRetryAfterRefresh: true });
    }
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errorBody = (data as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> } })
      ?.error;
    throw new ApiError(
      res.status,
      errorBody?.code ?? "UNKNOWN_ERROR",
      errorBody?.message ?? "Something went wrong",
      errorBody?.fieldErrors,
    );
  }

  return data as T;
}
