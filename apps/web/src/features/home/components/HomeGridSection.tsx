import { SectionHeader } from "@woobe/ui";
import Link from "next/link";
import { ProductGrid } from "@/features/catalog/components/ProductGrid";
import type { ProductSummary } from "@/features/catalog/api/products.client";

/**
 * A real shoppable product grid on the homepage (redesign spec §B, "Fresh
 * picks") — the customer meets a grid, not only rails, on the first screen.
 * Reuses the canonical `ProductGrid`/`ProductCard` and an already-fetched
 * slice of the home payload, so it adds no request.
 */
export function HomeGridSection({
  title,
  products,
  seeAllHref,
}: {
  title: string;
  products: ProductSummary[];
  seeAllHref?: string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          action={
            seeAllHref ? (
              <Link href={seeAllHref} className="hover:underline">
                See all
              </Link>
            ) : undefined
          }
        >
          {title}
        </SectionHeader>
        <ProductGrid products={products} />
      </div>
    </section>
  );
}
