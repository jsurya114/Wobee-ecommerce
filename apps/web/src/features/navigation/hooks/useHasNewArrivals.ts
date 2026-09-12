"use client";

import { useEffect, useState } from "react";
import { listProducts } from "@/features/catalog/api/products.client";

const STALE_TIME_MS = 5 * 60 * 1000;
let cache: { hasNewArrivals: boolean; fetchedAt: number } | null = null;

/**
 * Drives the header's contextual "New" control — reuses the existing
 * products client (`sort=newest&limit=1`, the same sort the New Arrivals
 * rail and hamburger link already use) rather than a new endpoint. Fails
 * closed: a request error hides the control instead of showing a broken or
 * fabricated state. The module-scoped cache is a lightweight stand-in for a
 * "small reasonable staleTime" without adding a query library.
 */
export function useHasNewArrivals(): boolean {
  const [hasNewArrivals, setHasNewArrivals] = useState(() => cache?.hasNewArrivals ?? false);

  useEffect(() => {
    const isFresh = cache !== null && Date.now() - cache.fetchedAt < STALE_TIME_MS;
    if (isFresh) {
      setHasNewArrivals(cache!.hasNewArrivals);
      return;
    }

    let cancelled = false;
    listProducts({ sort: "newest", limit: 1 })
      .then((result) => {
        const has = result.products.length > 0;
        cache = { hasNewArrivals: has, fetchedAt: Date.now() };
        if (!cancelled) setHasNewArrivals(has);
      })
      .catch(() => {
        if (!cancelled) setHasNewArrivals(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return hasNewArrivals;
}
