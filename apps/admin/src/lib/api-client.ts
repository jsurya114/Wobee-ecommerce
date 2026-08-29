/**
 * The ONLY thing that talks to apps/api (ARCHITECTURE.md §4.2), identical
 * shape to apps/web's own lib/api-client.ts — apps/admin never imports
 * @woobe/database or queries Postgres directly either (ADR-019).
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
  const url = process.env.NEXT_PUBLIC_ADMIN_API_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_ADMIN_API_URL is not set — copy apps/admin/.env.example to apps/admin/.env.local.");
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
