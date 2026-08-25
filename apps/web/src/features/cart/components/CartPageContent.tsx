"use client";

import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import Link from "next/link";
import { useCart } from "../hooks/useCart";
import { CartLineItem } from "./CartLineItem";

export function CartPageContent() {
  const { cart, isLoading } = useCart();

  if (isLoading || !cart) {
    return <p className="py-16 text-center font-body text-sm text-text-secondary">Loading your bag…</p>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">Your bag is empty.</p>
        <Link href="/products" className="font-body text-sm text-primary hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div>
        {cart.items.map((line) => (
          <CartLineItem key={line.itemId} line={line} />
        ))}
      </div>

      {/* Server-computed totals only — nothing here is derived from a client-held value (DEVELOPMENT_RULES.md #1). */}
      <aside className="h-fit rounded-card border border-border bg-surface p-6">
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

        {/* ADR-021 minimum-order / free-delivery progress — same numbers checkout enforces server-side, just surfaced here for the customer. */}
        {!cart.shipping.meetsMinimum ? (
          <p className="mt-3 rounded-control bg-primary-tint p-3 font-body text-xs text-text-secondary">
            Add {formatGrams(cart.shipping.gramsToMinimum)} more to your bag to check out.
          </p>
        ) : !cart.shipping.isFreeDelivery ? (
          <p className="mt-3 rounded-control bg-primary-tint p-3 font-body text-xs text-text-secondary">
            Add {formatGrams(cart.shipping.gramsToFreeDelivery)} more for free delivery.
          </p>
        ) : null}

        <Link
          href="/checkout"
          aria-disabled={!cart.shipping.meetsMinimum}
          className={`mt-4 flex h-11 w-full items-center justify-center rounded-control px-5 font-body text-base font-medium transition-colors ${
            cart.shipping.meetsMinimum
              ? "bg-primary text-white hover:bg-primary-hover"
              : "pointer-events-none bg-border text-text-secondary"
          }`}
        >
          Checkout
        </Link>
      </aside>
    </div>
  );
}
