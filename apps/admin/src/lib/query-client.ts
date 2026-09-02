import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-client";

/**
 * Every admin list/detail page shares one client so navigating between pages
 * cancels superseded fetches automatically (React Query aborts a query's
 * request when nothing is observing it any more) instead of leaving them to
 * race and paint stale data/errors over whatever page loads next.
 */
export function createAdminQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // 401 is handled by the auth-aware fetch wrapper (refresh + one retry);
          // 403/404 will never succeed on retry — only retry real transient failures.
          if (error instanceof ApiError && [401, 403, 404, 422].includes(error.status)) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
