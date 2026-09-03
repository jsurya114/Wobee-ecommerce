"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as couponsApi from "../api/admin-coupons.client";
import { couponsAdminQueryKey } from "../hooks/useAdminCoupons";
import { CouponForm } from "./CouponForm";

export function NewCouponForm() {
  const router = useRouter();
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  return (
    <Card className="max-w-xl p-4">
      <CouponForm
        submitLabel="Create coupon"
        onSubmit={async (payload) => {
          const result = await withFreshToken((token) => couponsApi.createCoupon(payload, token));
          await queryClient.invalidateQueries({ queryKey: couponsAdminQueryKey });
          toast.success("Coupon created");
          router.push(`/coupons/${result.coupon.id}`);
        }}
      />
    </Card>
  );
}
