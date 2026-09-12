"use client";

import { useEffect, useState } from "react";
import { listCategories, type Category } from "@/features/catalog/api/categories.client";

const STALE_TIME_MS = 5 * 60 * 1000;
let cache: { categories: Category[]; fetchedAt: number } | null = null;

/**
 * Feeds the drawer's "Categories" disclosure — same `listCategories()` the
 * rest of the catalog feature already uses (active-only, server-cached), no
 * second category data source. A tiny module-scoped cache stands in for a
 * "small reasonable staleTime" without pulling in a query library the app
 * doesn't otherwise depend on.
 */
export function useNavCategories(): { categories: Category[]; isLoading: boolean } {
  const [categories, setCategories] = useState<Category[]>(() => cache?.categories ?? []);
  const [isLoading, setIsLoading] = useState(() => !cache);

  useEffect(() => {
    const isFresh = cache !== null && Date.now() - cache.fetchedAt < STALE_TIME_MS;
    if (isFresh) {
      setCategories(cache!.categories);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    listCategories()
      .then((result) => {
        const sorted = [...result.categories].sort((a, b) => a.sortOrder - b.sortOrder);
        cache = { categories: sorted, fetchedAt: Date.now() };
        if (!cancelled) {
          setCategories(sorted);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, isLoading };
}
