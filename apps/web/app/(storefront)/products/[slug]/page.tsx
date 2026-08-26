import { notFound } from "next/navigation";
import { getProductBySlug } from "@/features/catalog/api/products.client";
import { ProductDetail } from "@/features/catalog/components/ProductDetail";
import { ApiError } from "@/lib/api-client";

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const result = await getProductBySlug(slug).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });

  if (!result) {
    notFound();
  }

  // Extra bottom clearance on mobile — ProductPurchasePanel's own fixed sticky buy bar sits above BottomNav.
  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-6 md:pb-8">
      <ProductDetail product={result.product} />
    </main>
  );
}
