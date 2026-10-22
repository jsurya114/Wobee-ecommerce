import { NewCouponForm } from "@/features/coupons/components/NewCouponForm";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function NewCouponPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/coupons", label: "Coupons" }} title="New coupon" />
      <NewCouponForm />
    </div>
  );
}
