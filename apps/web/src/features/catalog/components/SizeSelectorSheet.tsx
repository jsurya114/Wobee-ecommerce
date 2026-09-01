"use client";

import { Sheet } from "@woobe/ui";
import { Check, Loader2 } from "lucide-react";
import type { SizeChoice } from "../lib/group-variants-by-size";

/**
 * The one reusable size-selection surface (redesign spec — Quick Add / cart
 * "Change size" both use this) — a compact bottom sheet, never a full-page
 * redirect. Shows every size the catalogue actually has for this product;
 * out-of-stock sizes render disabled rather than being hidden, so the
 * shopper sees the full picture instead of wondering where a size went.
 */
export function SizeSelectorSheet({
  open,
  onOpenChange,
  title,
  sizes,
  selectedVariantId,
  onSelect,
  isBusy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  sizes: SizeChoice[];
  selectedVariantId?: string;
  onSelect: (variantId: string) => void;
  isBusy?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-wrap gap-2">
        {sizes.map((choice) => {
          const isSelected = choice.variantId === selectedVariantId;
          const isLowStock = choice.inStock && choice.availableQuantity <= 3;
          return (
            <button
              key={choice.size}
              type="button"
              disabled={!choice.inStock || isBusy}
              aria-pressed={isSelected}
              onClick={(event) => {
                // This sheet is a React *portal* child of whatever rendered
                // it (Quick Add is nested inside the product card's <Link>)
                // — React bubbles portal events through the component tree,
                // not the DOM tree, so without stopping it here a tap on a
                // size still fires the card's own link navigation.
                event.stopPropagation();
                onSelect(choice.variantId);
              }}
              className={`flex h-11 min-w-14 flex-col items-center justify-center gap-0 rounded-pill border px-4 font-body text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isSelected ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:bg-primary-tint"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {isSelected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {choice.size}
              </span>
              {!choice.inStock ? (
                <span className="text-[10px] leading-tight opacity-80">Out of stock</span>
              ) : isLowStock ? (
                <span className={`text-[10px] leading-tight ${isSelected ? "text-white/80" : "text-text-secondary"}`}>
                  {choice.availableQuantity} left
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {isBusy ? (
        <div className="mt-3 flex items-center gap-1.5 font-body text-xs text-text-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Updating…
        </div>
      ) : null}
    </Sheet>
  );
}
