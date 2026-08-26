"use client";

import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import { buttonVariants, Card, cn, Skeleton } from "@woobe/ui";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useCart } from "../hooks/useCart";
import { CartLineItem } from "./CartLineItem";
import { WeightThresholdBanner } from "./WeightThresholdBanner";

export function CartPageContent() {
  const { cart, isLoading } = useCart();

  if (isLoading || !cart) {
    return (
      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-28 w-24 shrink-0" />
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
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <ShoppingBag className="h-10 w-10 text-text-secondary" strokeWidth={1.25} aria-hidden="true" />
        <p className="font-body text-sm text-text-secondary">Your bag is empty.</p>
        <Link href="/products" className={buttonVariants()}>
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <Card className="p-5">
        {cart.items.map((line) => (
          <CartLineItem key={line.itemId} line={line} />
        ))}
      </Card>

      {/* Server-computed totals only — nothing here is derived from a client-held value (DEVELOPMENT_RULES.md #1). */}
      <Card className="h-fit p-6">
        <h2 className="mb-4 font-display text-lg text-text-primary">Order summary</h2>
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
        </dl>
        <div className="mt-4 flex justify-between border-t border-border pt-4 font-body text-base font-medium">
          <span className="text-text-primary">Total</span>
          <span className="text-text-primary">
            {formatPaiseAsInr(cart.totalPaise + (cart.shipping.isFreeDelivery ? 0 : cart.shipping.shippingFeePaise))}
          </span>
        </div>

        <div className="mt-4">
          <WeightThresholdBanner shipping={cart.shipping} totalWeightGrams={cart.totalWeightGrams} />
        </div>

        <Link
          href="/checkout"
          aria-disabled={!cart.shipping.meetsMinimum}
          className={cn(buttonVariants(), "mt-4 w-full", !cart.shipping.meetsMinimum && "pointer-events-none opacity-50")}
        >
          Checkout
        </Link>
      </Card>
    </div>
  );
}
