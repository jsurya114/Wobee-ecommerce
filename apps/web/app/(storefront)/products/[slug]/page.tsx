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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <ProductDetail product={result.product} />
    </main>
  );
}
