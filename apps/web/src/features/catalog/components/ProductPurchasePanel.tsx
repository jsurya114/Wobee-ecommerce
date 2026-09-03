"use client";

import { formatGrams, formatPaiseAsInr, formatPaiseAsInrCompact } from "@woobe/utils";
import { Button, cn, PriceTag } from "@woobe/ui";
import { ArrowRight, Check, ChevronDown, Minus, PackageCheck, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/features/cart/hooks/useCart";
import { deriveWeightStatus, type WeightStatus } from "@/features/cart/lib/derive-weight-status";
import { getShippingEstimate, type ShippingEstimate } from "@/features/shipping/api/shipping.client";
import { FLOATING_STACK_GAP_REM, MOBILE_BOTTOM_NAV_HEIGHT_REM } from "@/lib/layout-constants";
import type { ProductDetail } from "../api/products.client";
import { useSelectedVariant } from "../hooks/useSelectedVariant";

/**
 * Client island (redesign spec §F) — variant selection, quantity, add to
 * cart, plus the weight-based-price explainer, a free-text details
 * disclosure, and an informational delivery estimate. The rest of the PDP
 * (gallery, name, description) stays server-rendered.
 *
 * "Add to bag" renders twice on purpose: inline (desktop primary + mobile
 * pre-hydration fallback) and in a mobile-only floating liquid-glass
 * purchase dock (2026-09-04 PDP refinement) — see the dock's own comment
 * below for why it also carries the weight/free-shipping progress row.
 */
export function ProductPurchasePanel({ product }: { product: ProductDetail }) {
  // `cart` here is the SAME live cart state Home/Shop/Bag's own weight
  // trackers read (`useCartWeightBarVisibility` already excludes PDP routes
  // from the standalone floating pill, precisely because this panel folds
  // that same progress into its own dock instead — see below). No new
  // calculation: `deriveWeightStatus` is the identical pure function every
  // other weight tracker in the app uses. It reflects whatever the cart
  // actually holds right now, so once `handleAddToCart` below resolves and
  // the cart context updates, this row updates with it automatically.
  const { addItem, cart } = useCart();
  const cartWeightStatus = cart ? deriveWeightStatus(cart.weightBasedTotalGrams, cart.shipping) : null;
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
    // Tightened outer rhythm (2026-09-04 PDP refinement, gap-5 -> gap-4). Colour and
    // size are grouped into one "pick your variant" sub-block below (their own tighter
    // gap-3) instead of both taking the full outer gap independently — related fields
    // sit close together; the boundaries between price / variant-pick / CTA / details /
    // delivery stay as real section breaks.
    <div className="flex flex-col gap-4 pb-4 md:pb-0">
      <div className="flex flex-col gap-2">
        <PriceTag
          pricePaise={selectedVariant.pricePaise}
          weightGrams={selectedVariant.weightGrams}
          ratePerKgPaise={selectedVariant.ratePerKgPaise}
          size="lg"
        />
        {/* Null ratePerKgPaise (2026-08-31) = a FIXED-category product — there is no weight × rate breakdown to show, its price isn't derived that way. */}
        {selectedVariant.ratePerKgPaise !== null ? (
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
        ) : null}
      </div>

      {/* Colour + size grouped tightly — one "pick your variant" block (2026-09-04). */}
      <div className="flex flex-col gap-3">
        <div>
          {/* Just "Colour" — the selected chip below already shows the name + a checkmark, per the compact chip treatment. */}
          <p className="mb-2 font-body text-sm font-medium text-text-primary">Colour</p>
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
      </div>

      {/* Desktop placement + mobile's no-JS/pre-hydration fallback. */}
      <div className="hidden items-center gap-3 md:flex">
        <QuantityStepper quantity={quantity} max={maxQuantity} disabled={!selectedVariant.inStock} onChange={changeQuantity} />
        <Button
          type="button"
          onClick={() => void handleAddToCart()}
          isLoading={isAdding}
          disabled={!selectedVariant.inStock}
          className="flex-1 gap-1.5"
        >
          {addToBagLabel}
          {selectedVariant.inStock ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
        </Button>
      </div>

      {details.length > 0 ? (
        <details className="group border-t border-border pt-3">
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

      <div className="border-t border-border pt-3">
        <p className="mb-2 font-body text-sm font-medium text-text-primary">Delivery</p>
        {/* Input now takes the available row width instead of a fixed w-40 (2026-09-04) — the row previously left the Check button stranded in empty space at mobile widths. */}
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
            className="h-10 w-full min-w-0 flex-1 rounded-control border border-border bg-surface px-3 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => void checkPincode()} isLoading={checkingPincode} className="shrink-0">
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

      {/*
        Mobile: unified liquid-glass purchase dock (2026-09-04) — the
        weight/free-shipping progress row (when the cart has weight-based
        items) sits above the price/quantity/"Add to bag" row in ONE glass
        surface, mirroring the cart page's own `CheckoutDock`. Floats its own
        `FLOATING_STACK_GAP_REM` above the nav dock rather than sitting flush
        — `useWhatsAppBottomOffset` has the matching offset (and picks the
        right one of the two possible dock heights via the same
        `weightBasedTotalGrams > 0` condition used here).
      */}
      <div
        className="fixed inset-x-3 z-20 overflow-hidden rounded-card border border-white/50 bg-surface/80 shadow-modal backdrop-blur-xl md:hidden"
        style={{ bottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + env(safe-area-inset-bottom) + ${FLOATING_STACK_GAP_REM})` }}
      >
        {cartWeightStatus ? <PurchaseWeightProgressRow status={cartWeightStatus} weightBasedTotalGrams={cart!.weightBasedTotalGrams} /> : null}
        <div className={cn("flex items-center gap-3 px-4 py-3", cartWeightStatus && "border-t border-border/50")}>
          <PriceTag pricePaise={selectedVariant.pricePaise} className="flex-1" />
          <QuantityStepper quantity={quantity} max={maxQuantity} disabled={!selectedVariant.inStock} onChange={changeQuantity} />
          <Button
            type="button"
            onClick={() => void handleAddToCart()}
            isLoading={isAdding}
            disabled={!selectedVariant.inStock}
            className="shrink-0 gap-1.5 rounded-pill"
          >
            {addToBagLabel}
            {selectedVariant.inStock ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Same message/progress-fill logic as `FloatingCartWeightIndicator` (Home/Shop) and
 * `CheckoutDock` (Bag) — kept as a plain inline row here too rather than its own
 * bordered/shadowed pill, since the outer purchase dock already supplies the one glass
 * surface for both rows.
 */
function PurchaseWeightProgressRow({ status, weightBasedTotalGrams }: { status: WeightStatus; weightBasedTotalGrams: number }) {
  const isFreeDelivery = status.kind === "free-delivery";
  const message = isFreeDelivery
    ? "Free delivery unlocked"
    : status.kind === "below-minimum"
      ? `${formatGrams(status.gramsRemaining)} more to checkout`
      : `${formatGrams(status.gramsRemaining)} to unlock free shipping`;
  const fillPercent = isFreeDelivery ? 100 : Math.min(100, Math.max(0, status.percent));

  return (
    <div role="status" className={cn("relative flex items-center gap-2 overflow-hidden px-3 pb-2 pt-2.5", isFreeDelivery && "bg-success/10")}>
      <div
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", isFreeDelivery ? "bg-success/10" : "bg-primary/10")}
        style={{ width: `${fillPercent}%` }}
      />
      <span
        className={cn(
          "relative flex h-7 shrink-0 items-center justify-center rounded-full px-2 font-body text-[11px] font-bold",
          isFreeDelivery ? "bg-success/15 text-success" : "bg-primary-tint text-primary",
        )}
      >
        {isFreeDelivery ? <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" /> : formatGrams(weightBasedTotalGrams)}
      </span>
      <span className="relative min-w-0 flex-1 truncate font-body text-xs font-medium text-text-primary">{message}</span>
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
