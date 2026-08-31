"use client";

import { formatGrams, formatPaiseAsInr, formatPaiseAsInrCompact } from "@woobe/utils";
import { Button, PriceTag } from "@woobe/ui";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/features/cart/hooks/useCart";
import { getShippingEstimate, type ShippingEstimate } from "@/features/shipping/api/shipping.client";
import { ABOVE_MOBILE_BOTTOM_NAV_STYLE } from "@/lib/layout-constants";
import type { ProductDetail } from "../api/products.client";
import { useSelectedVariant } from "../hooks/useSelectedVariant";

/**
 * Client island (redesign spec §F) — variant selection, quantity, add to
 * cart, plus the weight-based-price explainer, a free-text details
 * disclosure, and an informational delivery estimate. The rest of the PDP
 * (gallery, name, description) stays server-rendered.
 *
 * "Add to bag" renders twice on purpose: inline (desktop primary + mobile
 * pre-hydration fallback) and in a `fixed` bar pinned above BottomNav on
 * mobile so the purchase action is always in reach.
 */
export function ProductPurchasePanel({ product }: { product: ProductDetail }) {
  const { addItem } = useCart();
  // Selection is shared with the wishlist heart in <ProductGallery> via the
  // PDP-scoped SelectedVariantProvider (one source of truth); quantity below
  // stays local to this panel.
  const { selectedVariantId, setSelectedVariantId } = useSelectedVariant();
  const [isAdding, setIsAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const [pincode, setPincode] = useState("");
  const [estimate, setEstimate] = useState<ShippingEstimate | null>(null);
  const [checkingPincode, setCheckingPincode] = useState(false);

  const colors = useMemo(() => Array.from(new Set(product.variants.map((v) => v.color))), [product.variants]);
  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const selectedColor = selectedVariant?.color;
  const sizesForColor = product.variants.filter((v) => v.color === selectedColor);
  const maxQuantity = selectedVariant?.availableQuantity ?? 1;

  function selectColor(color: string) {
    const sameSize = product.variants.find((v) => v.color === color && v.size === selectedVariant?.size);
    const next = sameSize ?? product.variants.find((v) => v.color === color);
    if (next) setSelectedVariantId(next.id);
    setQuantity(1);
  }

  function selectVariant(variantId: string) {
    setSelectedVariantId(variantId);
    setQuantity(1);
  }

  function changeQuantity(next: number) {
    setQuantity(Math.min(Math.max(next, 1), maxQuantity));
  }

  async function handleAddToCart() {
    if (!selectedVariant) return;
    setIsAdding(true);
    try {
      await addItem(selectedVariant.id, quantity);
      toast.success(`Added ${quantity} × ${product.name} (${selectedVariant.color}, ${selectedVariant.size}) to your bag`);
      setQuantity(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add this item to your bag");
    } finally {
      setIsAdding(false);
    }
  }

  async function checkPincode() {
    const trimmed = pincode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setEstimate(null);
      return;
    }
    setCheckingPincode(true);
    try {
      setEstimate(await getShippingEstimate(trimmed));
    } catch {
      setEstimate(null);
    } finally {
      setCheckingPincode(false);
    }
  }

  if (!selectedVariant) {
    return <p className="font-body text-sm text-text-secondary">This product is currently unavailable.</p>;
  }

  const addToBagLabel = selectedVariant.inStock ? "Add to bag" : "Out of stock";
  const details = [
    ["Fabric", selectedVariant.fabric],
    ["Fit", selectedVariant.fit],
    ["Measurements", selectedVariant.measurements],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="flex flex-col gap-5 pb-4 md:pb-0">
      <div className="flex flex-col gap-2">
        <PriceTag
          pricePaise={selectedVariant.pricePaise}
          weightGrams={selectedVariant.weightGrams}
          ratePerKgPaise={selectedVariant.ratePerKgPaise}
          size="lg"
        />
        <details className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 font-body text-xs font-medium text-text-secondary transition-colors hover:text-primary">
            How is this priced?
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mt-1.5 font-body text-xs text-text-secondary">
            {formatGrams(selectedVariant.weightGrams)} × {formatPaiseAsInrCompact(selectedVariant.ratePerKgPaise)}/kg ={" "}
            <span className="font-medium text-text-primary">{formatPaiseAsInr(selectedVariant.pricePaise)}</span>
          </p>
        </details>
      </div>

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
                className={`flex h-10 items-center gap-1.5 rounded-pill border px-3.5 font-body text-sm transition-colors ${
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
              onClick={() => selectVariant(variant.id)}
              className={`flex h-10 min-w-10 items-center justify-center rounded-pill border px-3.5 font-body text-sm transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${
                variant.id === selectedVariantId ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:bg-primary-tint"
              }`}
            >
              {variant.size}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop placement + mobile's no-JS/pre-hydration fallback. */}
      <div className="hidden items-center gap-3 md:flex">
        <QuantityStepper quantity={quantity} max={maxQuantity} disabled={!selectedVariant.inStock} onChange={changeQuantity} />
        <Button type="button" onClick={() => void handleAddToCart()} isLoading={isAdding} disabled={!selectedVariant.inStock} className="flex-1">
          {addToBagLabel}
        </Button>
      </div>

      {details.length > 0 ? (
        <details className="group border-t border-border pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between font-body text-sm font-medium text-text-primary">
            Details
            <ChevronDown className="h-4 w-4 text-text-secondary transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <dl className="mt-3 flex flex-col gap-2">
            {details.map(([label, value]) => (
              <div key={label} className="flex gap-3 font-body text-sm">
                <dt className="w-28 shrink-0 text-text-secondary">{label}</dt>
                <dd className="text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      <div className="border-t border-border pt-4">
        <p className="mb-2 font-body text-sm font-medium text-text-primary">Delivery</p>
        <div className="flex gap-2">
          <input
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void checkPincode();
            }}
            inputMode="numeric"
            placeholder="Delivery pincode"
            aria-label="Delivery pincode"
            className="h-10 w-40 rounded-control border border-border bg-surface px-3 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => void checkPincode()} isLoading={checkingPincode}>
            Check
          </Button>
        </div>
        {estimate ? (
          <p className={`mt-2 font-body text-xs ${estimate.serviceable ? "text-text-secondary" : "text-error"}`}>
            {estimate.serviceable
              ? `Delivers in ${estimate.estimatedDeliveryDaysMin}–${estimate.estimatedDeliveryDaysMax} days`
              : (estimate.reason ?? "Not serviceable at this pincode")}
          </p>
        ) : null}
      </div>

      {/* Mobile sticky purchase bar — pinned above BottomNav, always visible. */}
      <div
        className="fixed inset-x-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden"
        style={ABOVE_MOBILE_BOTTOM_NAV_STYLE}
      >
        <div className="flex items-center gap-3">
          <PriceTag pricePaise={selectedVariant.pricePaise} className="flex-1" />
          <QuantityStepper quantity={quantity} max={maxQuantity} disabled={!selectedVariant.inStock} onChange={changeQuantity} />
          <Button type="button" onClick={() => void handleAddToCart()} isLoading={isAdding} disabled={!selectedVariant.inStock} className="shrink-0">
            {addToBagLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Same pill-shaped +/- pattern as CartLineItem's quantity control. */
function QuantityStepper({
  quantity,
  max,
  disabled,
  onChange,
}: {
  quantity: number;
  max: number;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 rounded-pill border border-border">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={disabled || quantity <= 1}
        className="flex h-full w-9 items-center justify-center text-text-primary transition-colors disabled:opacity-40"
        aria-label="Decrease quantity"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span className="w-5 text-center font-body text-sm text-text-primary">{quantity}</span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={disabled || quantity >= max}
        className="flex h-full w-9 items-center justify-center text-text-primary transition-colors disabled:opacity-40"
        aria-label="Increase quantity"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
