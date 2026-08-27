"use client";

import { PriceTag, buttonVariants, cn } from "@woobe/ui";
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useWishlist } from "../hooks/useWishlist";
import type { WishlistLine } from "../api/wishlist.client";

export function WishlistLineItem({ line }: { line: WishlistLine }) {
  const { removeItem, moveToCart } = useWishlist();
  const [isPending, setIsPending] = useState(false);

  async function handleRemove() {
    setIsPending(true);
    try {
      await removeItem(line.itemId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove this item");
      setIsPending(false);
    }
  }

  async function handleMoveToCart() {
    setIsPending(true);
    try {
      await moveToCart(line.itemId, 1);
      toast.success(`Added ${line.productName} to your bag`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add this item to your bag");
      setIsPending(false);
    }
  }

  const unavailableReason = !line.isProductActive
    ? "No longer available"
    : line.variantId && !line.isVariantActive
      ? "This size is no longer available"
      : line.variantId && (line.availableQuantity ?? 0) === 0
        ? "Out of stock"
        : null;

  return (
    <div className="flex gap-4 border-b border-border py-5 last:border-b-0">
      <Link href={`/products/${line.productSlug}`} className="h-28 w-24 shrink-0 overflow-hidden rounded-control bg-primary-tint/40">
        {line.image ? <img src={line.image} alt={line.productName} className="h-full w-full object-cover" /> : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/products/${line.productSlug}`} className="font-body text-sm font-medium text-text-primary hover:text-primary">
              {line.productName}
            </Link>
            {line.color || line.size ? (
              <p className="font-body text-xs text-text-secondary">
                {line.color ? line.color : null}
                {line.color && line.size ? " · " : null}
                {line.size ? line.size : null}
              </p>
            ) : (
              <p className="font-body text-xs text-text-secondary">No size selected</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={isPending}
            aria-label="Remove from wishlist"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {unavailableReason ? <p className="font-body text-xs text-error">{unavailableReason}</p> : null}

        <div className="mt-1 flex items-end justify-between gap-2">
          <PriceTag pricePaise={line.pricePaise} />
          {line.variantId ? (
            <button
              type="button"
              onClick={() => void handleMoveToCart()}
              disabled={isPending || !line.isAvailable}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}
            >
              Move to bag
            </button>
          ) : (
            <Link href={`/products/${line.productSlug}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}>
              Choose a size
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
