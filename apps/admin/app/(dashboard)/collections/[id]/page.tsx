import { CollectionDetail } from "@/features/collections/components/CollectionDetail";

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CollectionDetail collectionId={id} />;
}
