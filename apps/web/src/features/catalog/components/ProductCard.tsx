import { PriceTag } from "@woobe/ui";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { QuickAddToBagButton } from "@/features/cart/components/QuickAddToBagButton";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import type { ProductSummary } from "../api/products.client";

/**
 * The one canonical product card (redesign spec §D) — reused by every grid
 * and rail (homepage, PLP, search, related, wishlist). Chrome-less: the
 * portrait image carries the frame; name, price, and the weight·rate line
 * sit under it with no border, no shadow, no inner padding.
 *
 * `showQuickAdd` opts the card into a compact "+" button pinned to the
 * image corner (the PLP grid and homepage "Fresh picks" grid pass it; the
 * rails don't). The weight·rate line renders whenever the summary carries
 * `fromWeightGrams` + `fromRatePerKgPaise` (server-resolved) — Woobe's
 * pricing mechanic on every card, not just the PDP.
 */
export function ProductCard({ product, showQuickAdd = false }: { product: ProductSummary; showQuickAdd?: boolean }) {
  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-card bg-surface-2">
        {product.primaryImage ? (
          // Plain <img>, not next/image — `product.images[].url` is an
          // arbitrary admin-entered URL with no fixed CDN host to allowlist
          // in `remotePatterns` (documented decision, journal). Every card
          // image is below the fold or in a carousel, so `loading="lazy"`
          // is the uncontested win.
          <img
            src={product.primaryImage.url}
            alt={product.primaryImage.altText}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none"
          />
        ) : (
          // No real image: an inert icon on the same bg-surface-2 fill,
          // not just a blank tinted rectangle (2026-09-03 final refinement
          // pass) — same card dimensions either way, no mock imagery.
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-6 w-6 text-text-secondary/40" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
        <WishlistButton productId={product.id} size="sm" className="absolute right-2 top-2" />
        {showQuickAdd ? (
          <QuickAddToBagButton slug={product.slug} productName={product.name} className="absolute bottom-2 right-2" />
        ) : null}
      </div>
      <p className="mt-1.5 truncate font-body text-xs font-medium text-text-primary lg:text-[13px]">{product.name}</p>
      <PriceTag
        className="mt-0.5"
        pricePaise={product.minPricePaiseCache}
        weightGrams={product.fromWeightGrams}
        ratePerKgPaise={product.fromRatePerKgPaise}
      />
    </Link>
  );
}
