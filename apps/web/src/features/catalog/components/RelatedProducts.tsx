import type { ProductSummary } from "../api/products.client";
import { ProductGrid } from "./ProductGrid";

/**
 * PDP "Related Products" section. Purely presentational — the backend
 * (`GetRelatedProductsUseCase`) decides what's related (other products in
 * the same category); this just renders the given list with the canonical
 * `ProductGrid` / `ProductCard`, so wishlist and quick-add-to-cart keep
 * working and every card links to its own PDP. Renders nothing when the
 * list is empty, so the section disappears rather than showing an empty
 * shell or unrelated products. Framing matches the sibling `ReviewsSection`
 * (top border + display heading).
 */
export function RelatedProducts({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) return null;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="mb-4 font-display text-xl text-text-primary">Related Products</h2>
      <ProductGrid products={products} />
    </section>
  );
}
