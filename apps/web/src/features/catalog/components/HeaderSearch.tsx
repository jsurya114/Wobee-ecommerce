"use client";

import { cn } from "@woobe/ui";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buildProductsHref } from "../lib/build-products-href";
import { ProductSearchForm } from "./ProductSearchForm";

/**
 * Header search — a magnifier button that expands the shared
 * `ProductSearchForm` open left-to-right, inline in the nav bar (width
 * transition, ease-in-out). Submit routes to `/products?q=…` via
 * `buildProductsHref` (products page reads `?q=` server-side → backend name
 * search) and collapses it; also collapses on Escape or an outside click.
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
    // button anchored right. Below md the wrapper is flex-1 so the open input
    // fills the gap without pushing the cart off-screen; at md+ it's a fixed
    // slot. `min-w-0` on the animating div is load-bearing (flexbox
    // `min-width:auto` otherwise keeps the collapsed input at its intrinsic
    // width).
    <div
      ref={containerRef}
      className="flex min-w-0 flex-1 items-center justify-end gap-1 md:flex-none"
    >
      <div
        inert={!open}
        className={cn(
          "min-w-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out",
          open ? "w-full opacity-100 md:w-64" : "w-0 opacity-0",
        )}
      >
        <ProductSearchForm
          ref={inputRef}
          hideIcon
          inputClassName="h-10 focus-visible:ring-0"
          onSubmit={(query) => {
            router.push(buildProductsHref({ q: query || undefined }));
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
