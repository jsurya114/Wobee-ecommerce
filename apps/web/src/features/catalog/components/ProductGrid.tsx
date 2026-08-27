import type { ProductSummary } from "../api/products.client";
import { ProductCard } from "./ProductCard";

/**
 * Purely presentational — the empty/result-count messaging lives in
 * ProductResults (Week 2 Day 1), which is the only current caller that
 * needs it. Renders nothing (not an empty grid shell) when there are no
 * products, so a caller's own empty state isn't fighting this one.
 */
export function ProductGrid({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
