import { formatPaiseAsInr } from "@woobe/utils";
import Link from "next/link";
import type { ProductSummary } from "../api/products.client";

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) {
    return <p className="py-16 text-center font-body text-sm text-text-secondary">No products found.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <Link key={product.id} href={`/products/${product.slug}`} className="group block">
          <div className="aspect-[4/5] overflow-hidden rounded-card bg-surface">
            {product.primaryImage ? (
              // Placeholder demo images (placehold.co) — next/image domain config isn't worth
              // adding for Week 1 seed data; real CDN images land with real catalogue content.
              <img
                src={product.primaryImage.url}
                alt={product.primaryImage.altText}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : null}
          </div>
          <p className="mt-2 font-body text-sm text-text-primary">{product.name}</p>
          <p className="font-body text-sm text-text-secondary">From {formatPaiseAsInr(product.minPricePaiseCache)}</p>
        </Link>
      ))}
    </div>
  );
}
