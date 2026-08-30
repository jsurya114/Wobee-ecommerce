"use client";

import { cn } from "@woobe/ui";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { getProductBySlug } from "@/features/catalog/api/products.client";
import { useCart } from "../hooks/useCart";

/**
 * Listing-grid "quick add" — a compact icon button pinned to the product
 * image's bottom-right corner (redesign spec §D), never a full-width row in
 * the card's text flow. The PLP summary carries no variant data
 * (`ProductSummary`), and the cart is variant-addressed, so a click fetches
 * the product detail on demand: a single-variant product is added straight
 * to the bag; anything that needs a colour/size choice sends the shopper to
 * the product page. No new API, no change to the cart contract.
 */
export function QuickAddToBagButton({ slug, productName, className }: { slug: string; productName: string; className?: string }) {
  const router = useRouter();
  const { addItem } = useCart();
  const [isBusy, setIsBusy] = useState(false);

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
      if (product.variants.length > 1) {
        toast.info("Choose a colour and size");
        router.push(`/products/${slug}`);
        return;
      }
      await addItem(inStock[0]!.id, 1);
      toast.success(`Added ${productName} to your bag`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add this item to your bag");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(event) => void handleClick(event)}
      disabled={isBusy}
      aria-label={`Add ${productName} to bag`}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60",
        className,
      )}
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      )}
    </button>
  );
}
