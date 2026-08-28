import { ReturnDetail } from "@/features/returns/components/ReturnDetail";

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReturnDetail returnId={id} />;
}
