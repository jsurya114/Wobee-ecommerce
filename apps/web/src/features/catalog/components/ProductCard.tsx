import { PriceTag } from "@woobe/ui";
import Link from "next/link";
import type { ProductSummary } from "../api/products.client";

/** The catalogue's core unit (woobe_ui_design_plan.md §9/§7) — image, name, and the price/weight mechanic via PriceTag. Used by both the PLP grid and the homepage rail. */
export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="aspect-[4/5] overflow-hidden rounded-card bg-primary-tint/40">
        {product.primaryImage ? (
          // Placeholder demo images (placehold.co) — next/image domain config isn't worth
          // adding for Week 1 seed data; real CDN images land with real catalogue content.
          <img
            src={product.primaryImage.url}
            alt={product.primaryImage.altText}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        ) : null}
      </div>
      <p className="mt-3 truncate font-body text-sm text-text-primary">{product.name}</p>
      <p className="font-body text-xs text-text-secondary">From</p>
      <PriceTag pricePaise={product.minPricePaiseCache} className="mt-0.5" />
    </Link>
  );
}
