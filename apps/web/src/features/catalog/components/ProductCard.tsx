import { PriceTag } from "@woobe/ui";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { QuickAddToBagButton } from "@/features/cart/components/QuickAddToBagButton";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import type { AppliedOffer, ProductSummary } from "../api/products.client";
import { ShareProductButton } from "./ShareProductButton";

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
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          <WishlistButton productId={product.id} size="sm" />
          <ShareProductButton slug={product.slug} name={product.name} size="sm" />
        </div>
        {showQuickAdd ? (
          <QuickAddToBagButton slug={product.slug} productName={product.name} className="absolute bottom-2 right-2" />
        ) : null}
      </div>
      <p className="mt-1.5 truncate font-body text-xs font-medium text-text-primary lg:text-[13px]">{product.name}</p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <PriceTag
          pricePaise={product.offerPricePaise}
          compareAtPricePaise={product.offer ? product.minPricePaiseCache : null}
          weightGrams={product.fromWeightGrams}
          ratePerKgPaise={product.fromRatePerKgPaise}
        />
        {product.offer ? <OfferBadge offer={product.offer} /> : null}
      </div>
    </Link>
  );
}

/**
 * Phase 2 (2026-09-14) — the "20% OFF" / "₹200 OFF" pill next to the price.
 * `PriceTag` (packages/ui) already renders the strikethrough original price
 * via `compareAtPricePaise` above; this is the one small addition kept in
 * this app rather than the shared primitive, since it's the only caller
 * that needs a discount LABEL alongside the two prices.
 */
function OfferBadge({ offer }: { offer: AppliedOffer }) {
  const label = offer.discountType === "PERCENTAGE" ? `${offer.discountValue}% OFF` : `₹${Math.round(offer.discountValue / 100)} OFF`;
  return <span className="rounded-pill bg-primary px-1.5 py-0.5 font-body text-[10px] font-semibold leading-none text-white">{label}</span>;
}
