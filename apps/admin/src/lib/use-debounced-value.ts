"use client";

import { useEffect, useState } from "react";

/**
 * Debounces a fast-changing value (typically a search input) so a value derived
 * from it — e.g. a React Query filter key — only updates `delayMs` after the
 * caller stops changing it, instead of on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
