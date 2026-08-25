"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Button } from "@woobe/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";
import type { OrderView } from "@/features/checkout/api/checkout.client";
import { openRazorpayCheckout } from "@/features/payments/lib/razorpay-checkout";
import * as paymentsApi from "@/features/payments/api/payments.client";
import * as ordersApi from "../api/orders.client";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

type PaymentStage = "idle" | "confirming-cod" | "awaiting-razorpay" | "confirming-razorpay" | "failed";

/**
 * The Week 1 Day 5 order-confirmation page. `Order.status` starting at
 * PENDING_PAYMENT is expected here — this component is what drives it the
 * rest of the way: COD confirms itself immediately (no gateway step);
 * Razorpay opens the Checkout widget and then POLLS the order rather than
 * trusting the widget's own success callback (ADR-014 — only a
 * webhook-verified capture, which apps/api handles entirely server-side,
 * ever actually confirms the order).
 */
export function OrderConfirmation({ orderId }: { orderId: string }) {
  const { accessToken, status: authStatus } = useAuth();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [stage, setStage] = useState<PaymentStage>("idle");
  const codConfirmAttempted = useRef(false);
  // Guards every setState below that can resolve after the widget/poll
  // outlives the component (navigated away mid-payment, mid-poll) — avoids
  // a "set state on an unmounted component" warning, not a correctness bug,
  // but cheap to close properly while the async chains are already here.
  const isMountedRef = useRef(true);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const refetch = useCallback(async () => {
    try {
      const fresh = await ordersApi.getOrder(orderId, accessToken ?? undefined);
      if (isMountedRef.current) setOrder(fresh);
      return fresh;
    } catch {
      if (isMountedRef.current) setLoadError(true);
      return null;
    }
  }, [orderId, accessToken]);

  useEffect(() => {
    // Wait for AuthProvider's silent-refresh to settle first (same guard
    // CartProvider uses) — an account-owned order fetched before that
    // resolves looks exactly like a guest request and correctly 404s
    // (GetOrderUseCase's ownership check), which otherwise gets
    // permanently mistaken for "this order doesn't exist".
    if (authStatus === "loading") return;
    void refetch();
  }, [refetch, authStatus]);

  // COD confirms itself, once, as soon as the order is known to be pending.
  useEffect(() => {
    if (!order || order.paymentMethod !== "COD" || order.status !== "PENDING_PAYMENT" || codConfirmAttempted.current) {
      return;
    }
    codConfirmAttempted.current = true;
    setStage("confirming-cod");
    void (async () => {
      try {
        await paymentsApi.confirmCodOrder({ orderId: order.id }, accessToken ?? undefined);
        await refetch();
      } catch (error) {
        if (!isMountedRef.current) return;
        setStage("failed");
        toast.error(error instanceof ApiError ? error.message : "Couldn't confirm your order. Please contact support.");
      }
    })();
  }, [order, accessToken, refetch]);

  const pollUntilConfirmed = useCallback(async () => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline && isMountedRef.current) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const fresh = await refetch();
      if (fresh && fresh.status !== "PENDING_PAYMENT") return;
    }
  }, [refetch]);

  const payWithRazorpay = useCallback(async () => {
    if (!order) return;
    setStage("awaiting-razorpay");
    try {
      const config = await paymentsApi.createRazorpayOrder({ orderId: order.id }, accessToken ?? undefined);
      await openRazorpayCheckout(config);
      // Widget reported success — NOT authoritative (ADR-014). Poll until
      // the webhook-verified confirmation actually lands.
      if (isMountedRef.current) setStage("confirming-razorpay");
      await pollUntilConfirmed();
      if (isMountedRef.current) setStage("idle");
    } catch (error) {
      if (!isMountedRef.current) return;
      setStage("failed");
      toast.error(error instanceof Error ? error.message : "Payment didn't go through. You can try again.");
    }
  }, [order, accessToken, pollUntilConfirmed]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">We couldn&apos;t find that order.</p>
        <Link href="/products" className="font-body text-sm text-primary hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order) {
    return <p className="py-16 text-center font-body text-sm text-text-secondary">Loading your order…</p>;
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <StatusHeading order={order} stage={stage} />

      <dl className="w-full rounded-card border border-border bg-surface p-4 text-left font-body text-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Order</dt>
          <dd className="text-text-primary">{order.orderNumber}</dd>
        </div>
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

      {order.status === "PENDING_PAYMENT" && order.paymentMethod === "RAZORPAY" && stage !== "confirming-razorpay" ? (
        <Button onClick={() => void payWithRazorpay()} isLoading={stage === "awaiting-razorpay"}>
          {stage === "failed" ? "Try payment again" : "Pay now"}
        </Button>
      ) : null}

      <Link href="/products" className="font-body text-sm text-primary hover:underline">
        Continue shopping
      </Link>
    </div>
  );
}

function StatusHeading({ order, stage }: { order: OrderView; stage: PaymentStage }) {
  if (order.status === "CONFIRMED") {
    return <h1 className="font-display text-2xl text-text-primary">Order confirmed!</h1>;
  }
  if (order.status === "PAYMENT_FAILED") {
    return <h1 className="font-display text-2xl text-text-primary">Payment failed</h1>;
  }
  if (stage === "confirming-cod" || stage === "confirming-razorpay") {
    return <h1 className="font-display text-2xl text-text-primary">Confirming your order…</h1>;
  }
  return <h1 className="font-display text-2xl text-text-primary">Order placed</h1>;
}
