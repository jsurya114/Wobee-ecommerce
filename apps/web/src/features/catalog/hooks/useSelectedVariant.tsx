"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { VariantWithPriceAndStock } from "../api/products.client";

interface SelectedVariantContextValue {
  /** Undefined only when the product has no variants at all (PDP renders an "unavailable" state in that case). */
  selectedVariantId: string | undefined;
  setSelectedVariantId: (variantId: string) => void;
}

const SelectedVariantContext = createContext<SelectedVariantContextValue | null>(null);

/** The initial-selection rule for a PDP — first in-stock variant, else the first variant. One place, consumed by the panel and the wishlist heart. */
function resolveInitialVariantId(variants: VariantWithPriceAndStock[]): string | undefined {
  return variants.find((variant) => variant.inStock)?.id ?? variants[0]?.id;
}

/**
 * PDP-scoped shared state for "which variant is currently selected", so the
 * variant chosen in <ProductPurchasePanel> and the wishlist heart in
 * <ProductGallery> — sibling client islands under a Server Component parent
 * — agree without prop drilling. Mirrors the CartProvider/WishlistProvider
 * context pattern already used across this app for cross-island client
 * state. Selection is the only thing shared here; quantity stays local to
 * the purchase panel.
 */
export function SelectedVariantProvider({
  variants,
  children,
}: {
  variants: VariantWithPriceAndStock[];
  children: ReactNode;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(() => resolveInitialVariantId(variants));

  const set = useCallback((variantId: string) => setSelectedVariantId(variantId), []);

  const value = useMemo<SelectedVariantContextValue>(
    () => ({ selectedVariantId, setSelectedVariantId: set }),
    [selectedVariantId, set],
  );

  return <SelectedVariantContext.Provider value={value}>{children}</SelectedVariantContext.Provider>;
}

export function useSelectedVariant(): SelectedVariantContextValue {
  const ctx = useContext(SelectedVariantContext);
  if (!ctx) {
    throw new Error("useSelectedVariant must be used within <SelectedVariantProvider>");
  }
  return ctx;
}
