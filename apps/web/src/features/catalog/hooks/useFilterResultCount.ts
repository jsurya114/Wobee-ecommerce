"use client";

import { useEffect, useState } from "react";
import { listProducts, type ProductListParams } from "../api/products.client";

const DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Live "Show N results" preview for a filter sheet's *pending* (not yet
 * applied) selection — a real server count (`limit: 1`, only `total` is
 * used), never a client-side guess over whatever page is already loaded.
 * Debounced and abortable (same shape as `useSearchSuggestions`) and, via
 * `enabled`, only fires while the sheet is actually open — no request for
 * every keystroke, and none at all in the closed/idle state.
 */
export function useFilterResultCount(
  query: Omit<ProductListParams, "page" | "limit">,
  { enabled = true }: { enabled?: boolean } = {},
): { count: number | null; isLoading: boolean } {
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    listProducts({ ...debounced, limit: 1 }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setCount(result.total);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        setCount(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `debounced` is a fresh object each render; its JSON.stringify identity is the real dependency.
  }, [JSON.stringify(debounced), enabled]);

  return { count, isLoading };
}
