"use client";

import { Button, PriceTag } from "@woobe/ui";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/features/cart/hooks/useCart";
import type { ProductDetail } from "../api/products.client";

/**
 * Client island — variant selection + add-to-cart needs interactivity and
 * useCart(); the rest of the product page (images, description) stays a
 * Server Component (ARCHITECTURE.md §4.2: page composes feature
 * components, feature components hold the interactive/data logic).
 *
 * The "Add to bag" action renders twice on purpose: once inline (desktop's
 * primary placement, and mobile's fallback before JS/hydration), and once
 * in a `fixed` bar pinned above BottomNav on mobile — the sticky
 * always-visible purchase action woobe_ui_design_plan.md §2/§12 calls for
 * (`position: sticky`-style, not a scroll listener). `md:hidden` on the
 * fixed bar avoids a redundant second button once the two-column desktop
 * layout already keeps the inline one on screen.
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

  const addToBagLabel = selectedVariant.inStock ? "Add to bag" : "Out of stock";

  return (
    <div className="flex flex-col gap-6 pb-4 md:pb-0">
      <PriceTag
        pricePaise={selectedVariant.pricePaise}
        weightGrams={selectedVariant.weightGrams}
        ratePerKgPaise={selectedVariant.ratePerKgPaise}
        size="detail"
      />

      <div>
        <p className="mb-2 font-body text-sm font-medium text-text-primary">Colour: {selectedVariant.color}</p>
        <div className="flex flex-wrap gap-2">
          {colors.map((color) => {
            const isSelected = color === selectedColor;
            return (
              <button
                key={color}
                type="button"
                onClick={() => selectColor(color)}
                aria-pressed={isSelected}
                className={`flex h-11 items-center gap-1.5 rounded-pill border px-4 font-body text-sm transition-colors ${
                  isSelected ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:bg-primary-tint"
                }`}
              >
                {isSelected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {color}
              </button>
            );
          })}
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
              aria-pressed={variant.id === selectedVariantId}
              onClick={() => setSelectedVariantId(variant.id)}
              className={`flex h-11 min-w-11 items-center justify-center rounded-pill border px-4 font-body text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                variant.id === selectedVariantId ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:bg-primary-tint"
              }`}
            >
              {variant.size}
              {!variant.inStock ? " (out)" : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop placement + mobile's no-JS/pre-hydration fallback. */}
      <Button type="button" onClick={() => void handleAddToCart()} isLoading={isAdding} disabled={!selectedVariant.inStock} className="hidden w-full md:inline-flex">
        {addToBagLabel}
      </Button>

      {/* Mobile sticky purchase bar — pinned above BottomNav, always visible while scrolling. */}
      <div className="fixed inset-x-0 bottom-20 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-3">
          <PriceTag pricePaise={selectedVariant.pricePaise} className="flex-1" />
          <Button type="button" onClick={() => void handleAddToCart()} isLoading={isAdding} disabled={!selectedVariant.inStock} className="shrink-0">
            {addToBagLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
