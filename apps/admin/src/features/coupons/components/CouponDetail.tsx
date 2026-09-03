"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, Button, Card } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAdminCoupon } from "../hooks/useAdminCoupon";
import { CouponForm, toDatetimeLocalValue, toRupeesValue } from "./CouponForm";

export function CouponDetail({ couponId }: { couponId: string }) {
  const router = useRouter();
  const { coupon, loading, error, update, setActive, remove } = useAdminCoupon(couponId);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (loading) {
    return <LoadingState />;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!coupon) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Coupon not found.</p>;
  }

  const toggleActive = async () => {
    setIsTogglingActive(true);
    try {
      await setActive(!coupon.isActive);
      toast.success(coupon.isActive ? "Coupon deactivated" : "Coupon activated");
    } catch {
      toast.error("Couldn't update status.");
    } finally {
      setIsTogglingActive(false);
    }
  };

  const onDelete = async () => {
    if (coupon.redemptionCount > 0) {
      toast.error("This coupon has already been used — deactivate it instead of deleting.");
      return;
    }
    if (!window.confirm(`Delete coupon "${coupon.code}"? This can't be undone.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await remove();
      toast.success("Coupon deleted");
      router.push("/coupons");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete this coupon.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:max-w-xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl text-text-primary">{coupon.code}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={coupon.isActive ? "success" : "neutral"}>{coupon.isActive ? "active" : "inactive"}</Badge>
          <Button variant="secondary" size="sm" isLoading={isTogglingActive} onClick={() => void toggleActive()}>
            {coupon.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <Card flat className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Stat label="Redeemed" value={String(coupon.redemptionCount)} />
        <Stat label="Usage limit" value={coupon.usageLimit !== null ? String(coupon.usageLimit) : "Unlimited"} />
        <Stat label="Per customer" value={coupon.perUserLimit !== null ? String(coupon.perUserLimit) : "Unlimited"} />
        <Stat label="Min. cart value" value={coupon.minCartValuePaise !== null ? formatPaiseAsInr(coupon.minCartValuePaise) : "None"} />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Details</h2>
        <CouponForm
          // Next reuses this component instance across /coupons/[id1] -> [id2] navigation — same fix as CategoryForm/ProductForm.
          key={couponId}
          initialValues={{
            code: coupon.code,
            type: coupon.type,
            value: coupon.type === "FLAT" ? toRupeesValue(coupon.value) : String(coupon.value),
            minCartValueRupees: toRupeesValue(coupon.minCartValuePaise),
            maxDiscountRupees: toRupeesValue(coupon.maxDiscountPaise),
            usageLimit: coupon.usageLimit !== null ? String(coupon.usageLimit) : "",
            perUserLimit: coupon.perUserLimit !== null ? String(coupon.perUserLimit) : "",
            validFrom: toDatetimeLocalValue(coupon.validFrom),
            validTo: toDatetimeLocalValue(coupon.validTo),
          }}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            await update(payload);
            toast.success("Coupon updated");
          }}
        />
      </Card>

      <Card flat className="flex items-center justify-between p-4">
        <div>
          <p className="font-body text-sm font-medium text-text-primary">Delete this coupon</p>
          <p className="font-body text-xs text-text-secondary">
            {coupon.redemptionCount > 0 ? "Already used — deactivate instead of deleting." : "Only possible before it's ever been used."}
          </p>
        </div>
        <Button variant="secondary" size="sm" isLoading={isDeleting} disabled={coupon.redemptionCount > 0} onClick={() => void onDelete()}>
          Delete
        </Button>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-1 font-body text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
