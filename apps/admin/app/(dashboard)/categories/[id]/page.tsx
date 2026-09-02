import { CategoryDetail } from "@/features/categories/components/CategoryDetail";

export default async function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CategoryDetail categoryId={id} />;
}
