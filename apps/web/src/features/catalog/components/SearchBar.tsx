"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Input } from "@woobe/ui";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";

/**
 * Advanced search (ADR-012) — a real `<form>` so it also works as a plain
 * GET without JS (falls back to a full navigation to the same URL
 * client-side routing would build); progressively enhanced to push via the
 * router when JS is available. Preserves every other active filter, drops
 * `page` (see buildProductsHref) — a new search term invalidates whatever
 * page number was valid for the old result set.
 */
export function SearchBar({ currentParams }: { currentParams: ProductsQueryParams }) {
  const router = useRouter();
  const [value, setValue] = useState(currentParams.q ?? "");

  // Re-sync from the URL whenever ?q= actually changes for a reason other
  // than this component's own submit — most notably FiltersPanel's "Clear
  // filters". Only fires when the committed value changes, so it never
  // clobbers in-progress typing (which hasn't touched currentParams.q yet).
  // A `key`-based remount was tried first and rejected — it left a second,
  // stale <input id="product-search"> in the DOM after a router.push
  // triggered from a sibling component (verified live, not assumed).
  useEffect(() => {
    setValue(currentParams.q ?? "");
  }, [currentParams.q]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    router.push(buildProductsHref({ ...currentParams, q: trimmed || undefined }));
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="mb-4 flex gap-2">
      <label htmlFor="product-search" className="sr-only">
        Search products
      </label>
      <Input
        id="product-search"
        type="search"
        name="q"
        placeholder="Search products…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1"
      />
    </form>
  );
}
