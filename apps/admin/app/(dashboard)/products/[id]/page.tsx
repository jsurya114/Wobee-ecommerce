import { ProductDetail } from "@/features/products/components/ProductDetail";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetail productId={id} />;
}
