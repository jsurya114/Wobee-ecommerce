"use client";

import { useEffect, useRef, useState } from "react";
import { searchProductSuggestions, type ProductSuggestion } from "../api/products.client";

/** Below this the query is too noisy to suggest against — mirrors the API's own `MIN_SUGGESTION_QUERY_LENGTH`. */
export const MIN_SUGGESTION_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/** Debounce a value — keystrokes settle before we act on them. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export interface SearchSuggestionsState {
  suggestions: ProductSuggestion[];
  isLoading: boolean;
  /** The trimmed query the current `suggestions` correspond to. */
  query: string;
}

/**
 * Debounced product typeahead (redesign). Single responsibility: turn a raw
 * input string into a settled list of suggestions — debounce, fetch, cancel
 * the previous request, expose loading state. It owns no UI and no routing;
 * the caller decides what a suggestion or a submit does.
 *
 * `enabled` lets a caller pause it (e.g. the header search while collapsed)
 * without unmounting — the last results are cleared when it goes false.
 */
export function useSearchSuggestions(rawQuery: string, { enabled = true }: { enabled?: boolean } = {}): SearchSuggestionsState {
  const trimmed = rawQuery.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const settledQueryRef = useRef("");

  useEffect(() => {
    if (!enabled || debounced.length < MIN_SUGGESTION_QUERY_LENGTH) {
      setSuggestions([]);
      setIsLoading(false);
      settledQueryRef.current = "";
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    searchProductSuggestions(debounced, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSuggestions(result.suggestions);
        settledQueryRef.current = debounced;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        // A failed lookup just means no suggestions — search still works via submit.
        setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [debounced, enabled]);

  return { suggestions, isLoading, query: settledQueryRef.current };
}
