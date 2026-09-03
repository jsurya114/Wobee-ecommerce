import { CouponDetail } from "@/features/coupons/components/CouponDetail";

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CouponDetail couponId={id} />;
}
