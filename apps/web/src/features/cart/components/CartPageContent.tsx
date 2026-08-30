"use client";

import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import { buttonVariants, Card, cn, EmptyState, Skeleton } from "@woobe/ui";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { ABOVE_MOBILE_BOTTOM_NAV_STYLE } from "@/lib/layout-constants";
import { useCart } from "../hooks/useCart";
import { CartLineItem } from "./CartLineItem";
import { CouponForm } from "./CouponForm";
import { WeightThresholdBanner } from "./WeightThresholdBanner";

export function CartPageContent() {
  const { cart, isLoading } = useCart();

  if (isLoading || !cart) {
    return (
      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="aspect-[3/4] w-24 shrink-0 rounded-control" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="mt-4 h-9 w-24" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag strokeWidth={1.25} aria-hidden="true" />}
        title="Your bag is empty."
        description="Browse the catalogue and add something you love."
        action={
          <Link href="/products" className={buttonVariants()}>
            Continue shopping
          </Link>
        }
      />
    );
  }

  const payableTotal =
    cart.totalPaise + (cart.shipping.isFreeDelivery ? 0 : cart.shipping.shippingFeePaise) - cart.discountPaise;

  return (
    <>
      <div className="grid gap-8 pb-24 md:grid-cols-[1fr_320px] md:pb-0">
        <Card className="p-4 sm:p-5">
          {cart.items.map((line) => (
            <CartLineItem key={line.itemId} line={line} />
          ))}
        </Card>

        {/* Server-computed totals only — nothing here is derived from a client-held value (DEVELOPMENT_RULES.md #1). */}
        <Card className="h-fit p-5">
          <h2 className="mb-4 font-body text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary">Order summary</h2>
          <dl className="flex flex-col gap-2 font-body text-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">Items ({cart.itemCount})</dt>
              <dd className="text-text-primary">{formatPaiseAsInr(cart.totalPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Total weight</dt>
              <dd className="text-text-primary">{formatGrams(cart.totalWeightGrams)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Shipping</dt>
              <dd className="text-text-primary">
                {cart.shipping.isFreeDelivery ? "Free" : formatPaiseAsInr(cart.shipping.shippingFeePaise)}
              </dd>
            </div>
            {cart.discountPaise > 0 ? (
              <div className="flex justify-between">
                <dt className="text-text-secondary">Coupon discount</dt>
                <dd className="text-success">-{formatPaiseAsInr(cart.discountPaise)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex justify-between border-t border-border pt-4 font-body text-base font-semibold">
            <span className="text-text-primary">Total</span>
            <span className="text-text-primary">{formatPaiseAsInr(payableTotal)}</span>
          </div>

          <div className="mt-4">
            <CouponForm appliedCoupon={cart.appliedCoupon} />
          </div>

          <div className="mt-4">
            <WeightThresholdBanner shipping={cart.shipping} totalWeightGrams={cart.totalWeightGrams} />
          </div>

          <Link
            href="/checkout"
            aria-disabled={!cart.shipping.meetsMinimum}
            className={cn(buttonVariants(), "mt-4 hidden w-full md:flex", !cart.shipping.meetsMinimum && "pointer-events-none opacity-50")}
          >
            Checkout
          </Link>
        </Card>
      </div>

      {/* Mobile: a slim sticky checkout bar so the CTA is always in reach on a long bag. */}
      <div
        className="fixed inset-x-0 z-20 flex items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden"
        style={ABOVE_MOBILE_BOTTOM_NAV_STYLE}
      >
        <span className="font-body text-base font-semibold text-text-primary">{formatPaiseAsInr(payableTotal)}</span>
        <Link
          href="/checkout"
          aria-disabled={!cart.shipping.meetsMinimum}
          className={cn(buttonVariants(), "ml-auto flex-1", !cart.shipping.meetsMinimum && "pointer-events-none opacity-50")}
        >
          Checkout
        </Link>
      </div>
    </>
  );
}
