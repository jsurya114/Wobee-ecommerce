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
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, accessToken, headers, ...rest } = options;

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
