"use client";

import { cn } from "@woobe/ui";
import { Sparkle } from "lucide-react";
import Link from "next/link";
import { useHasNewArrivals } from "../hooks/useHasNewArrivals";

/**
 * The header's one contextual discovery control (top-right) — links to the
 * same `/products?sort=newest` destination the hamburger's "New Arrivals"
 * item and the homepage rail's "See all" both use. Renders an empty,
 * same-shaped spacer (not an inactive button) when there are no current new
 * arrivals, so the mobile header's centered-logo grid keeps its balance
 * either way.
 *
 * Icon-only from `md` up to `lg` (the "New" label returns at `lg:`): the
 * existing desktop `<nav>` (Home/Shop/Wishlist/Bag/account block) already
 * runs a signed-in user right to the edge of a 768px viewport on its own —
 * confirmed live, ~50px of horizontal overflow with this control removed
 * entirely — so adding a full text pill in that narrow band pushes it
 * further rather than causing it outright. This keeps the control's own
 * footprint minimal there without touching that pre-existing nav (out of
 * this task's scope) — full elimination of the underlying overflow needs
 * that nav's own responsive treatment, tracked separately.
 */
export function NewArrivalsControl({ className }: { className?: string }) {
  const hasNewArrivals = useHasNewArrivals();

  if (!hasNewArrivals) {
    return <span aria-hidden="true" className={cn("inline-block h-9 w-9", className)} />;
  }

  return (
    <Link
      href="/products?sort=newest"
      aria-label="New arrivals"
      className={cn(
        "flex h-9 items-center gap-1 rounded-pill border border-primary/30 bg-primary-tint px-2.5 md:px-2 lg:px-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-primary transition-colors hover:bg-primary hover:text-white",
        className,
      )}
    >
      <Sparkle className="h-3 w-3" aria-hidden="true" />
      <span className="md:hidden lg:inline">New</span>
    </Link>
  );
}
