"use client";

import { Button, Input } from "@woobe/ui";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";
import type { AppliedCoupon } from "../api/cart.client";
import { useCart } from "../hooks/useCart";

/**
 * week2 (1).md §9's customer-facing "Apply coupon" action. Coupons require a
 * real account (Cart.couponCode's own schema comment) — a guest sees a
 * "Log in to apply a coupon" prompt instead of the input, rather than a
 * confusing failure after typing a code.
 */
export function CouponForm({ appliedCoupon }: { appliedCoupon: AppliedCoupon | null }) {
  const { status } = useAuth();
  const { applyCoupon, removeCoupon } = useCart();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  if (status !== "authenticated") {
    return <p className="font-body text-xs text-text-secondary">Log in to apply a coupon.</p>;
  }

  const onApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      await applyCoupon(trimmed);
      toast.success("Coupon applied");
      setCode("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't apply that coupon. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRemove = async () => {
    setIsRemoving(true);
    try {
      await removeCoupon();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't remove the coupon. Please try again.");
    } finally {
      setIsRemoving(false);
    }
  };

  if (appliedCoupon) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 rounded-control bg-primary-tint/40 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-body text-sm font-medium text-text-primary">{appliedCoupon.code}</p>
            {!appliedCoupon.isValid && appliedCoupon.reason ? (
              <p className="font-body text-xs text-error">{appliedCoupon.reason}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            aria-label="Remove coupon"
            className="shrink-0 rounded-control p-1 text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onApply} className="flex gap-2">
      <Input
        aria-label="Coupon code"
        name="couponCode"
        placeholder="Coupon code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="h-9 text-sm"
      />
      <Button type="submit" variant="secondary" size="sm" isLoading={isSubmitting} disabled={!code.trim()} className="shrink-0">
        Apply
      </Button>
    </form>
  );
}
