import { OfferDetail } from "@/features/offers/components/OfferDetail";

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OfferDetail offerId={id} />;
}
