"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatPaiseAsInr } from "@woobe/utils";
import { checkoutSchema, type CheckoutInput } from "@woobe/validation";
import { Button, FormField } from "@woobe/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCart } from "@/features/cart/hooks/useCart";
import * as checkoutApi from "../api/checkout.client";
import type { OrderView } from "../api/checkout.client";

export function CheckoutForm() {
  const { user, accessToken } = useAuth();
  const { cart, isLoading: isCartLoading } = useCart();
  const [placedOrder, setPlacedOrder] = useState<OrderView | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "COD" },
  });

  // Pre-fill from the account profile for a logged-in shopper — still fully
  // editable (shipping to a different person/address is a valid case).
  useEffect(() => {
    if (!user) return;
    setValue("contactEmail", user.email);
    setValue("address.fullName", user.name);
    if (user.phone) setValue("address.phone", user.phone);
  }, [user, setValue]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const order = await checkoutApi.checkout(data, accessToken ?? undefined);
      setPlacedOrder(order);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fieldErrors) {
          for (const [field, messages] of Object.entries(error.fieldErrors)) {
            if (messages?.[0]) setError(field as keyof CheckoutInput, { message: messages[0] });
          }
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error("Something went wrong. Please try again.");
    }
  });

  if (placedOrder) {
    return <OrderPlacedSummary order={placedOrder} />;
  }

  if (isCartLoading) {
    return <p className="py-16 text-center font-body text-sm text-text-secondary">Loading your bag…</p>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">Your bag is empty.</p>
        <Link href="/products" className="font-body text-sm text-primary hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!cart.shipping.meetsMinimum) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">
          Your bag needs {cart.shipping.gramsToMinimum}g more to meet the minimum order weight.
        </p>
        <Link href="/cart" className="font-body text-sm text-primary hover:underline">
          Back to bag
        </Link>
      </div>
    );
  }

  const estimatedTotal = cart.totalPaise + (cart.shipping.isFreeDelivery ? 0 : cart.shipping.shippingFeePaise);

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <h2 className="font-display text-lg text-text-primary">Contact</h2>
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.contactEmail?.message}
          {...register("contactEmail")}
        />

        <h2 className="mt-2 font-display text-lg text-text-primary">Shipping address</h2>
        <FormField
          label="Full name"
          autoComplete="name"
          error={errors.address?.fullName?.message}
          {...register("address.fullName")}
        />
        <FormField
          label="Phone"
          type="tel"
          autoComplete="tel"
          error={errors.address?.phone?.message}
          {...register("address.phone")}
        />
        <FormField
          label="Address line 1"
          autoComplete="address-line1"
          error={errors.address?.line1?.message}
          {...register("address.line1")}
        />
        <FormField
          label="Address line 2 (optional)"
          autoComplete="address-line2"
          error={errors.address?.line2?.message}
          {...register("address.line2")}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="City" autoComplete="address-level2" error={errors.address?.city?.message} {...register("address.city")} />
          <FormField
            label="State"
            autoComplete="address-level1"
            error={errors.address?.state?.message}
            {...register("address.state")}
          />
        </div>
        <FormField
          label="Pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          error={errors.address?.pincode?.message}
          {...register("address.pincode")}
        />

        <h2 className="mt-2 font-display text-lg text-text-primary">Payment method</h2>
        {/* Both methods land on PENDING_PAYMENT this week (Week 1 Day 4) —
            Razorpay's checkout flow and COD's immediate CONFIRMED transition
            are Day 5 (ADR-014). Capturing the choice now is what Order.paymentMethod needs. */}
        <div className="flex flex-col gap-2 font-body text-sm text-text-primary">
          <label className="flex items-center gap-2">
            <input type="radio" value="COD" {...register("paymentMethod")} defaultChecked />
            Cash on delivery
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="RAZORPAY" {...register("paymentMethod")} />
            Pay online (Razorpay)
          </label>
        </div>

        <Button type="submit" isLoading={isSubmitting} className="mt-2">
          {isSubmitting ? "Placing order…" : `Place order — ${formatPaiseAsInr(estimatedTotal)}`}
        </Button>
      </form>

      <aside className="h-fit rounded-card border border-border bg-surface p-6">
        <h2 className="mb-4 font-display text-lg text-text-primary">Order summary</h2>
        <dl className="flex flex-col gap-2 font-body text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Items ({cart.itemCount})</dt>
            <dd className="text-text-primary">{formatPaiseAsInr(cart.totalPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Shipping</dt>
            <dd className="text-text-primary">
              {cart.shipping.isFreeDelivery ? "Free" : formatPaiseAsInr(cart.shipping.shippingFeePaise)}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex justify-between border-t border-border pt-4 font-body text-base font-medium">
          <span className="text-text-primary">Estimated total</span>
          <span className="text-text-primary">{formatPaiseAsInr(estimatedTotal)}</span>
        </div>
        <p className="mt-3 font-body text-xs text-text-secondary">
          Tax is calculated server-side and shown on your final order confirmation.
        </p>
      </aside>
    </div>
  );
}

/**
 * Inline success state, not a dedicated /order-confirmation/[id] route —
 * that page (plus a real "My Orders" list) is Week 1 Day 5 scope, built
 * alongside the payment confirmation flow this order snapshot feeds into.
 */
function OrderPlacedSummary({ order }: { order: OrderView }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h2 className="font-display text-2xl text-text-primary">Order placed!</h2>
      <p className="font-body text-sm text-text-secondary">
        Order <span className="font-medium text-text-primary">{order.orderNumber}</span> — we&apos;ll email{" "}
        {order.contactEmail} once it&apos;s confirmed.
      </p>
      <dl className="w-full rounded-card border border-border bg-surface p-4 text-left font-body text-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Payment method</dt>
          <dd className="text-text-primary">{order.paymentMethod === "COD" ? "Cash on delivery" : "Razorpay"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Status</dt>
          <dd className="text-text-primary">{order.status.replace(/_/g, " ").toLowerCase()}</dd>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-medium">
          <dt className="text-text-primary">Total</dt>
          <dd className="text-text-primary">{formatPaiseAsInr(order.totalPaise)}</dd>
        </div>
      </dl>
      <Link href="/products" className="font-body text-sm text-primary hover:underline">
        Continue shopping
      </Link>
    </div>
  );
}
