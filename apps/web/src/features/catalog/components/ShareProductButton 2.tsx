"use client";

import { cn } from "@woobe/ui";
import { Share2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { absoluteUrl } from "@/lib/site-url";
import { shareProduct } from "../lib/share-product";

/**
 * The ONE share affordance, reused everywhere a product is shown (redesign
 * spec parity with `WishlistButton` — same circular icon-button shape/sizes/
 * positioning contract, same "stop the parent <Link> from navigating" click
 * handling, since both sit inside a card/gallery that's itself a link).
 * Always shares the canonical PDP URL (`/products/<slug>`), never the
 * current listing/category URL — the caller only ever passes the product's
 * own slug, not `window.location`.
 */
export function ShareProductButton({
  slug,
  name,
  size = "md",
  className,
}: {
  slug: string;
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [isPending, setIsPending] = useState(false);
  const dimension = size === "sm" ? "h-7 w-7" : "h-10 w-10";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  async function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isPending) return;

    setIsPending(true);
    try {
      const outcome = await shareProduct({ url: absoluteUrl(`/products/${slug}`), title: name });
      if (outcome === "copied") {
        toast.success("Product link copied");
      } else if (outcome === "failed") {
        toast.error("Couldn't share this product. Try again.");
      }
      // "shared": the native sheet already gave its own feedback. "cancelled":
      // the shopper deliberately backed out — neither needs a toast here.
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      disabled={isPending}
      aria-label={`Share ${name}`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface/90 text-text-secondary shadow-sm backdrop-blur transition-colors hover:text-primary disabled:opacity-50",
        dimension,
        className,
      )}
    >
      <Share2 className={iconSize} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
