"use client";

import { Button } from "@woobe/ui";
import { ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { getProductBySlug } from "@/features/catalog/api/products.client";
import { useCart } from "../hooks/useCart";

/**
 * Listing-grid "quick add". The PLP summary carries no variant data
 * (`ProductSummary`), and the cart is variant-addressed, so a click fetches
 * the product detail on demand: a single-variant product is added straight
 * to the bag; anything that needs a colour/size choice sends the shopper to
 * the product page. No new API, no change to the cart contract — reuses
 * `useCart().addItem` and the existing `getProductBySlug`.
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
    <Button
      type="button"
      variant="primary"
      size="sm"
      onClick={(event) => void handleClick(event)}
      isLoading={isBusy}
      className={className}
    >
      <ShoppingBag className="h-4 w-4" aria-hidden="true" />
      Add to bag
    </Button>
  );
}
