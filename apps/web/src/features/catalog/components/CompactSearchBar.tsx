"use client";

import { cn } from "@woobe/ui";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buildProductsHref } from "@/features/catalog/lib/build-products-href";
import { SearchField } from "@/features/catalog/components/SearchField";
import { LIQUID_GLASS_RADIUS_CLASS, LIQUID_GLASS_SURFACE_CLASS } from "@/lib/liquid-glass";
import { SITE_HEADER_HEIGHT_REM } from "@/lib/layout-constants";

/**
 * Compact, lightweight search entry point (UI/UX refinement pass,
 * 2026-09-03), mounted on the home page AND the shop listing (`md:hidden` —
 * mobile viewports get this row in addition to the header's own search;
 * desktop relies on `HeaderSearch` alone, which is already part of the
 * sticky header on both routes). Sits in its own row directly BELOW the
 * sticky header (never inside it), so it can never expand over/hide the
 * centered Woobe logo the way the old header-inline `HeaderSearch` risked on
 * mobile. Reuses the exact same `SearchField` (typeahead, submit-to-
 * `/products?q=`, select-a-suggestion) every other search entry point on the
 * site uses — this only changes when that real field mounts.
 *
 * Renders as an inert, input-styled trigger button until tapped (52px tall —
 * deliberately lighter than a functional input so it doesn't compete with
 * the banner or grab keyboard focus on page load) — tapping it swaps in the
 * real, focused `SearchField` in the same slot.
 *
 * Look (2026-09-21): a floating pill wearing the SAME liquid-glass surface
 * as `BottomNav` (`lib/liquid-glass.ts` — one shared definition, so the two
 * can't drift). It is that design in every scroll state; nothing here reacts
 * to scrolling. The glass lives on a container div (not the button/input) so
 * its sheen layer can sit under the content and so the typeahead dropdown,
 * which is absolutely positioned inside, isn't clipped.
 */
const PILL_CLASS = cn("relative h-[3.25rem] w-full", LIQUID_GLASS_RADIUS_CLASS, LIQUID_GLASS_SURFACE_CLASS);

/**
 * The strip is `sticky` directly under the sticky `SiteHeader` so search
 * stays reachable while scrolling — on Home and, since it is the same
 * component, on Shop. It has no fill of its own: the pill floats over the
 * page, and the glass blurs whatever scrolls beneath. `z-20` is
 * SiteHeader's own existing value, not a new tier: it has to outrank
 * `PlpControlBar` (`z-10`, Shop's sticky Size/Filters/Sort row that stacks
 * right below this) so the typeahead dropdown opens OVER that row instead
 * of behind it; the two never overlap otherwise (this sits below the
 * header, and the header is earlier in the DOM).
 */
const WRAPPER_CLASS = "sticky z-20 px-4 pb-2 pt-3 md:hidden";
const WRAPPER_STYLE = { top: SITE_HEADER_HEIGHT_REM } as const;

export function CompactSearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <div className={WRAPPER_CLASS} style={WRAPPER_STYLE}>
        <div className={PILL_CLASS}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative flex h-full w-full items-center gap-3 rounded-[inherit] px-4 text-left font-body text-sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Search className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">Search tops, dresses, accessories…</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={WRAPPER_CLASS} style={WRAPPER_STYLE}>
      <div className={PILL_CLASS}>
        <SearchField
          ref={inputRef}
          // The pill supplies the surface, so the real input is transparent and borderless inside it.
          // `!rounded-[1.375rem]` = LIQUID_GLASS_RADIUS_CLASS, forced: the base Input's own `rounded-control`
          // is a custom class twMerge can't recognise as conflicting, so without `!` it wins and the focus
          // ring would be an 8px-cornered box inside a 22px pill.
          inputClassName="h-[3.25rem] !rounded-[1.375rem] border-transparent bg-transparent shadow-none"
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
    </div>
  );
}
