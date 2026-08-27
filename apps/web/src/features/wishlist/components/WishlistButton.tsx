"use client";

import { cn } from "@woobe/ui";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useWishlist } from "../hooks/useWishlist";

/**
 * The PLP/PDP "save" affordance (week2 (1).md §5) — a heart icon toggle.
 * Guests are redirected to login rather than shown a disabled/hidden
 * button: saving requires an account (no guest wishlist), but the affordance
 * itself should still be discoverable pre-login, same as most storefronts'
 * "log in to save" convention.
 */
export function WishlistButton({
  productId,
  variantId,
  className,
  size = "md",
}: {
  productId: string;
  variantId?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const { status } = useAuth();
  const { isSaved, addItem, removeItem, wishlist } = useWishlist();
  const [isPending, setIsPending] = useState(false);

  const saved = isSaved(productId);
  const dimension = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  async function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (status !== "authenticated") {
      router.push("/login");
      return;
    }

    setIsPending(true);
    try {
      if (saved) {
        const item = wishlist?.items.find((line) => line.productId === productId);
        if (item) await removeItem(item.itemId);
      } else {
        await addItem(productId, variantId);
      }
    } catch (error) {
      // 409 (already saved, a duplicate add lost a race) isn't worth an
      // error toast — the end state ("it's saved") is already what the
      // shopper wanted; the wishlist context's own refetch after the
      // failed mutation attempt (see useWishlist's addItem) settles the
      // UI to match reality either way.
      const message = error instanceof Error ? error.message : "";
      if (!message.toLowerCase().includes("already in your wishlist")) {
        toast.error(saved ? "Couldn't remove from wishlist" : "Couldn't save to wishlist");
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      disabled={isPending}
      aria-pressed={saved}
      aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface/90 text-text-secondary shadow-sm backdrop-blur transition-colors hover:text-primary disabled:opacity-50",
        dimension,
        className,
      )}
    >
      <Heart className={iconSize} strokeWidth={1.75} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
