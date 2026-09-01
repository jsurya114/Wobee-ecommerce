"use client";

import { cn } from "@woobe/ui";
import { Loader2, Plus } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { getProductBySlug } from "@/features/catalog/api/products.client";
import { SizeSelectorSheet } from "@/features/catalog/components/SizeSelectorSheet";
import { groupVariantsBySize, type SizeChoice } from "@/features/catalog/lib/group-variants-by-size";
import { useCart } from "../hooks/useCart";

/**
 * Listing-grid "quick add" — a compact icon button pinned to the product
 * image's bottom-right corner (redesign spec §D), never a full-width row in
 * the card's text flow. The PLP summary carries no variant data
 * (`ProductSummary`), so a click fetches the product detail on demand: a
 * single-size product (or a Free Size one — "One Size" is the domain's own
 * canonical value, nothing new invented) adds straight to the bag; a
 * genuinely multi-size product opens the shared `SizeSelectorSheet` right
 * here on the card's page — never a PDP redirect, and never an
 * auto-picked size. No new "add" API, the cart contract is unchanged.
 */
export function QuickAddToBagButton({ slug, productName, className }: { slug: string; productName: string; className?: string }) {
  const { addItem } = useCart();
  const [isBusy, setIsBusy] = useState(false);
  const [isAddingSize, setIsAddingSize] = useState(false);
  const [sizeChoices, setSizeChoices] = useState<SizeChoice[] | null>(null);

  async function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsBusy(true);
    try {
      const { product } = await getProductBySlug(slug);
      const inStock = product.variants.filter((variant) => variant.inStock);

      if (inStock.length === 0) {
        toast.error(`${productName} is out of stock`);
        return;
      }

      const sizes = groupVariantsBySize(product.variants);
      if (sizes.length === 1) {
        await addItem(sizes[0]!.variantId, 1);
        toast.success(`Added ${productName} to your bag`);
        return;
      }

      setSizeChoices(sizes);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add this item to your bag");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSelectSize(variantId: string) {
    setIsAddingSize(true);
    try {
      await addItem(variantId, 1);
      toast.success(`Added ${productName} to your bag`);
      setSizeChoices(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add this item to your bag");
    } finally {
      setIsAddingSize(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => void handleClick(event)}
        disabled={isBusy}
        aria-label={`Add ${productName} to bag`}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60",
          className,
        )}
      >
        {isBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        )}
      </button>

      {sizeChoices ? (
        <SizeSelectorSheet
          open={sizeChoices !== null}
          onOpenChange={(open) => {
            if (!open) setSizeChoices(null);
          }}
          title={`Select size — ${productName}`}
          sizes={sizeChoices}
          onSelect={(variantId) => void handleSelectSize(variantId)}
          isBusy={isAddingSize}
        />
      ) : null}
    </>
  );
}
