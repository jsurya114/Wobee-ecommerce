"use client";

import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import { Button } from "@woobe/ui";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/features/cart/hooks/useCart";
import type { ProductDetail } from "../api/products.client";

/**
 * Client island — variant selection + add-to-cart needs interactivity and
 * useCart(); the rest of the product page (images, description) stays a
 * Server Component (ARCHITECTURE.md §4.2: page composes feature
 * components, feature components hold the interactive/data logic).
 */
export function ProductPurchasePanel({ product }: { product: ProductDetail }) {
  const { addItem } = useCart();
  const [selectedVariantId, setSelectedVariantId] = useState(
    product.variants.find((v) => v.inStock)?.id ?? product.variants[0]?.id,
  );
  const [isAdding, setIsAdding] = useState(false);

  const colors = useMemo(() => Array.from(new Set(product.variants.map((v) => v.color))), [product.variants]);
  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const selectedColor = selectedVariant?.color;
  const sizesForColor = product.variants.filter((v) => v.color === selectedColor);

  function selectColor(color: string) {
    // Keep the same size if that combination exists, otherwise fall back to the first available size for the new color.
    const sameSize = product.variants.find((v) => v.color === color && v.size === selectedVariant?.size);
    const next = sameSize ?? product.variants.find((v) => v.color === color);
    if (next) setSelectedVariantId(next.id);
  }

  async function handleAddToCart() {
    if (!selectedVariant) return;
    setIsAdding(true);
    try {
      await addItem(selectedVariant.id, 1);
      toast.success(`Added ${product.name} (${selectedVariant.color}, ${selectedVariant.size}) to your bag`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add this item to your bag");
    } finally {
      setIsAdding(false);
    }
  }

  if (!selectedVariant) {
    return <p className="font-body text-sm text-text-secondary">This product is currently unavailable.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-display text-3xl text-text-primary">{formatPaiseAsInr(selectedVariant.pricePaise)}</p>
        <p className="font-body text-sm text-text-secondary">
          {formatGrams(selectedVariant.weightGrams)} · {formatPaiseAsInr(selectedVariant.ratePerKgPaise)}/kg
        </p>
      </div>

      <div>
        <p className="mb-2 font-body text-sm font-medium text-text-primary">Colour: {selectedVariant.color}</p>
        <div className="flex flex-wrap gap-2">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => selectColor(color)}
              className={`rounded-pill border px-4 py-1.5 font-body text-sm transition-colors ${
                color === selectedColor ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:bg-primary-tint"
              }`}
            >
              {color}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-body text-sm font-medium text-text-primary">Size</p>
        <div className="flex flex-wrap gap-2">
          {sizesForColor.map((variant) => (
            <button
              key={variant.id}
              type="button"
              disabled={!variant.inStock}
              onClick={() => setSelectedVariantId(variant.id)}
              className={`rounded-pill border px-4 py-1.5 font-body text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                variant.id === selectedVariantId ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:bg-primary-tint"
              }`}
            >
              {variant.size}
              {!variant.inStock ? " (out of stock)" : ""}
            </button>
          ))}
        </div>
      </div>

      <Button type="button" onClick={() => void handleAddToCart()} isLoading={isAdding} disabled={!selectedVariant.inStock} className="w-full">
        {selectedVariant.inStock ? "Add to bag" : "Out of stock"}
      </Button>
    </div>
  );
}
