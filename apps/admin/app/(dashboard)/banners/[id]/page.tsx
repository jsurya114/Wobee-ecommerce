import { BannerDetail } from "@/features/banners/components/BannerDetail";

export default async function BannerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BannerDetail bannerId={id} />;
}
