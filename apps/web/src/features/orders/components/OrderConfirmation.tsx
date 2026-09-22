"use client";

import { Card, Spinner } from "@woobe/ui";
import { OrderPriceBreakdown } from "./OrderPriceBreakdown";
import { CheckCircle2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";
import type { OrderView } from "@/features/checkout/api/checkout.client";
import { fireConfetti } from "@/features/checkout/components/OrderPlacementCelebration";
import * as paymentsApi from "@/features/payments/api/payments.client";
import * as ordersApi from "../api/orders.client";
import { OrderStatusBadge } from "./OrderStatusBadge";

type PaymentStage = "idle" | "confirming-cod" | "failed";

/**
 * The order-confirmation page. Reached in exactly two ways: a COD order
 * (which has no gateway step — this component confirms it itself, right
 * below) or a RAZORPAY order that `/payment/[id]` (PaymentStatus.tsx) has
 * itself navigated here to, having already seen the webhook-verified
 * `Order.status === "CONFIRMED"` (ADR-014). It is deliberately NOT where a
 * RAZORPAY payment is attempted, retried, cancelled, or failed — see the
 * redirect effect below, which sends any RAZORPAY order that isn't (or
 * isn't yet) CONFIRMED straight to that dedicated page instead. That split
 * (2026-09-22) is what guarantees this page can never show "Order placed"
 * or its celebration before a payment has actually succeeded.
 */
export function OrderConfirmation({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { accessToken, status: authStatus } = useAuth();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [stage, setStage] = useState<PaymentStage>("idle");
  const codConfirmAttempted = useRef(false);
  const confettiFiredRef = useRef(false);
  const shouldReduceMotion = useReducedMotion();
  // Guards every setState below that can resolve after the COD-confirm call
  // outlives the component (navigated away mid-confirm) — avoids a "set
  // state on an unmounted component" warning, not a correctness bug, but
  // cheap to close properly while the async chain is already here.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
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

  // Bug fix (2026-09-22): a RAZORPAY order that isn't CONFIRMED yet has no
  // business rendering this page at all — that's what let "Order placed"
  // show up before payment had actually succeeded. Any such order (still
  // PENDING_PAYMENT, or webhook-confirmed PAYMENT_FAILED) gets bounced to
  // the dedicated payment page instead, which owns every one of those
  // states. This also covers a stray direct visit to this URL for an unpaid
  // order — not just the checkout-initiated navigation.
  useEffect(() => {
    if (!order) return;
    if (order.paymentMethod === "RAZORPAY" && order.status !== "CONFIRMED") {
      router.replace(`/payment/${order.id}`);
    }
  }, [order, router]);

  // CheckoutForm's own celebration (confetti + "Order Placed!") fires at COD
  // placement time and never renders on this page. A RAZORPAY order only
  // ever reaches this page already CONFIRMED (see the redirect above), so
  // that's the moment this page's own burst celebrates instead — once per
  // mount, skipped under reduced motion exactly like OrderPlacementCelebration's
  // own guard, and RAZORPAY-only so a COD order (which transitions
  // PENDING_PAYMENT -> CONFIRMED right here, via the confirming-cod effect
  // above) doesn't get a second, duplicate burst on top of the one
  // CheckoutForm already played on /checkout moments earlier.
  useEffect(() => {
    if (shouldReduceMotion || !order || order.paymentMethod !== "RAZORPAY" || order.status !== "CONFIRMED" || confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    fireConfetti();
  }, [order, shouldReduceMotion]);

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

  // Still loading, or about to be redirected to /payment/[id] by the effect
  // above — never render this page's own "placed"/"confirmed" content for
  // an unconfirmed RAZORPAY order, even for the one render before that
  // effect fires.
  if (!order || (order.paymentMethod === "RAZORPAY" && order.status !== "CONFIRMED")) {
    return <p className="py-16 text-center font-body text-sm text-text-secondary">Loading your order…</p>;
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center">
      <StatusHeading order={order} stage={stage} />

      <Card className="w-full p-5 text-left">
        <dl className="flex flex-col gap-2.5 font-body text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Order</dt>
            <dd className="text-text-primary">{order.orderNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Payment method</dt>
            <dd className="text-text-primary">{order.paymentMethod === "COD" ? "Cash on delivery" : "Razorpay"}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-secondary">Status</dt>
            <dd>
              <OrderStatusBadge status={order.status} />
            </dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-border pt-4">
          <OrderPriceBreakdown order={order} />
        </div>
      </Card>

      <Link href="/products" className="font-body text-sm text-primary hover:underline">
        Continue shopping
      </Link>
    </div>
  );
}

function StatusHeading({ order, stage }: { order: OrderView; stage: PaymentStage }) {
  const shouldReduceMotion = useReducedMotion();
  const iconProps = { className: "h-9 w-9", strokeWidth: 1.5, "aria-hidden": true } as const;

  if (order.status === "CONFIRMED") {
    const icon = <CheckCircle2 {...iconProps} className="h-9 w-9 text-success" />;
    return (
      <div className="flex flex-col items-center gap-3">
        {shouldReduceMotion ? (
          icon
        ) : (
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            {icon}
          </motion.div>
        )}
        <h1 className="font-display text-2xl text-text-primary">Order confirmed!</h1>
      </div>
    );
  }
  if (stage === "confirming-cod") {
    return (
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <h1 className="font-display text-2xl text-text-primary">Confirming your order…</h1>
      </div>
    );
  }
  return <h1 className="font-display text-2xl text-text-primary">Order placed</h1>;
}
