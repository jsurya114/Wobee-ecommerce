"use client";

import { cn } from "@woobe/ui";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buildProductsHref } from "../lib/build-products-href";
import { SearchField } from "./SearchField";

/**
 * Header search — a magnifier button that expands the shared `SearchField`
 * open left-to-right, inline in the nav bar (width transition). Typing shows
 * a debounced typeahead; submit routes to `/products?q=…` and picking a
 * suggestion jumps straight to the product. Collapses on Escape (once the
 * dropdown is closed) or an outside click.
 */
export function HeaderSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    // Stays on the right (next to the nav / cart). Button is fixed; the input
    // grows open toward the logo from the button — `justify-end` keeps the
    // button anchored right. Below md the wrapper is `flex-1` so the open
    // input fills the row without pushing the cart off-screen; at md+ it's a
    // fixed slot. `min-w-0` on the animating div is load-bearing (flexbox
    // `min-width:auto` otherwise keeps the collapsed input at its intrinsic
    // width).
    // This is the only product search on `/` and `/products` (there is no
    // in-page search bar) — shown on every viewport, mobile included.
    <div
      ref={containerRef}
      className="flex min-w-0 flex-1 items-center justify-end gap-1 md:flex-none"
    >
      <div
        inert={!open}
        className={cn(
          "min-w-0 transition-[width,opacity] duration-300 ease-in-out",
          // `overflow-hidden` clips the input during collapse; `overflow-visible`
          // when open lets the typeahead dropdown escape downward.
          open ? "w-full overflow-visible opacity-100 md:w-64" : "w-0 overflow-hidden opacity-0",
        )}
      >
        <SearchField
          ref={inputRef}
          hideIcon
          inputClassName="h-10 focus-visible:ring-0"
          suggestionsEnabled={open}
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

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close search" : "Search"}
        aria-expanded={open}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-primary transition-colors hover:text-primary md:h-9 md:w-9"
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Search className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
