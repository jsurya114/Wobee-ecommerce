import { NewCouponForm } from "@/features/coupons/components/NewCouponForm";

export default function NewCouponPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">New coupon</h1>
      <NewCouponForm />
    </div>
  );
}
