"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buildProductsHref } from "@/features/catalog/lib/build-products-href";
import { SearchField } from "@/features/catalog/components/SearchField";

/**
 * Compact, lightweight search entry point (UI/UX refinement pass,
 * 2026-09-03) shared by the home page and the shop listing — sits in its
 * own row directly BELOW the sticky header (never inside it), so it can
 * never expand over/hide the centered Woobe logo the way the old
 * header-inline `HeaderSearch` risked on mobile. Reuses the exact same
 * `SearchField` (typeahead, submit-to-`/products?q=`, select-a-suggestion)
 * every other search entry point on the site uses — this only changes when
 * that real field mounts.
 *
 * Renders as an inert, input-styled trigger button until tapped (a
 * `~44px`-tall, moderate-radius, warm-tinted "fake" field — deliberately
 * lighter than a functional input so it doesn't compete with the banner or
 * grab keyboard focus on page load) — tapping it swaps in the real,
 * focused `SearchField` in the same slot.
 */
export function CompactSearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <div className="px-4 pb-2 pt-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 w-full items-center gap-2 rounded-control border border-transparent bg-surface-2 px-3.5 text-left font-body text-sm text-text-secondary transition-colors hover:bg-surface-2/70"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate">Search tops, dresses, accessories…</span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-2 pt-3 md:hidden">
      <SearchField
        ref={inputRef}
        inputClassName="rounded-control border-transparent bg-surface-2"
        onSubmit={(query) => {
          router.push(buildProductsHref({ q: query || undefined }));
          setOpen(false);
        }}
        onSelectSuggestion={(slug) => {
          router.push(`/products/${slug}`);
          setOpen(false);
        }}
      />
    </div>
  );
}
