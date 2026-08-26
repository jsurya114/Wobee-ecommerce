import type { ProductSummary } from "../api/products.client";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">No products found in this category yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
