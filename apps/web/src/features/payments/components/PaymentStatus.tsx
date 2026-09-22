"use client";

import { Button, Card, Spinner } from "@woobe/ui";
import { formatPaiseAsInr } from "@woobe/utils";
import { PackageX } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { OrderView } from "@/features/checkout/api/checkout.client";
import * as ordersApi from "@/features/orders/api/orders.client";
import * as paymentsApi from "../api/payments.client";
import { RazorpayPaymentCancelledError, openRazorpayCheckout } from "../lib/razorpay-checkout";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

type Stage = "idle" | "awaiting-razorpay" | "confirming" | "cancelled" | "failed";

/**
 * Dedicated Razorpay payment page (2026-09-22, split out of
 * OrderConfirmation). Everything before a webhook-verified capture lives
 * here instead — opening the widget, polling, and a cancelled/failed
 * outcome — so a shopper can never land on "Order confirmed!" (or its
 * celebration) before the backend has actually verified the payment
 * (ADR-014). `/order-confirmation/[id]` only ever renders once THIS page
 * has itself navigated there, after seeing `Order.status === "CONFIRMED"`.
 * COD never reaches this page — it has no gateway step, and
 * OrderConfirmation redirects any non-RAZORPAY order straight back there.
 */
export function PaymentStatus({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { accessToken, status: authStatus } = useAuth();
  // `?autopay=1` — CheckoutForm appends this when it navigates straight here
  // after placing a RAZORPAY order, so the widget opens immediately instead
  // of requiring a second manual click. A later, unrelated visit to this
  // same URL never carries this param, so the manual "Pay now"/"Try payment
  // again" button below remains the only trigger then.
  const searchParams = useSearchParams();
  const shouldAutopay = searchParams.get("autopay") === "1";

  const [order, setOrder] = useState<OrderView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const autoAttempted = useRef(false);
  // Same "avoid setState after unmount" guard OrderConfirmation's own async
  // chains use — the widget/poll can easily outlive a shopper navigating
  // away mid-payment.
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
    if (authStatus === "loading") return;
    void refetch();
  }, [refetch, authStatus]);

  // This page only has work to do for a RAZORPAY order still awaiting (or
  // just rejected on) payment. Anything else — already CONFIRMED (a stale
  // `?autopay=1` revisit, or a webhook that landed while the shopper was
  // away), a COD order, or any other order state entirely — has nothing
  // left for this page to show, so it hands off to the real order page
  // immediately rather than rendering stale/irrelevant payment UI.
  useEffect(() => {
    if (!order) return;
    if (order.paymentMethod !== "RAZORPAY" || (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED")) {
      router.replace(`/order-confirmation/${order.id}`);
      return;
    }
    if (order.status === "PAYMENT_FAILED") setStage("failed");
  }, [order, router]);

  const pollUntilSettled = useCallback(async (): Promise<OrderView | null> => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline && isMountedRef.current) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const fresh = await refetch();
      if (fresh && fresh.status !== "PENDING_PAYMENT") return fresh;
    }
    return null;
  }, [refetch]);

  const payWithRazorpay = useCallback(async () => {
    if (!order) return;
    setStage("awaiting-razorpay");
    try {
      const config = await paymentsApi.createRazorpayOrder({ orderId: order.id }, accessToken ?? undefined);
      await openRazorpayCheckout(config);
      // Widget reported success — NOT authoritative (ADR-014). Poll until
      // the webhook-verified outcome actually lands before this page does
      // anything the shopper could read as "done".
      if (isMountedRef.current) setStage("confirming");
      const settled = await pollUntilSettled();
      if (!isMountedRef.current) return;
      if (settled?.status === "CONFIRMED") {
        // Only now — after backend verification — does the shopper ever
        // reach the confirmation page.
        router.push(`/order-confirmation/${order.id}`);
        return;
      }
      // Timed out still PENDING_PAYMENT, or the webhook resolved it as
      // PAYMENT_FAILED — either way, stay here and say so plainly.
      setStage("failed");
    } catch (error) {
      if (!isMountedRef.current) return;
      // Cancelled vs. failed get their own stage/copy — a shopper closing
      // the widget is not the same outcome as a bank/gateway decline.
      if (error instanceof RazorpayPaymentCancelledError) {
        setStage("cancelled");
        toast.error("Payment cancelled. Your order has not been confirmed.");
      } else {
        setStage("failed");
        toast.error(error instanceof Error ? error.message : "Payment didn't go through. You can try again.");
      }
    }
  }, [order, accessToken, pollUntilSettled, router]);

  useEffect(() => {
    if (
      !shouldAutopay ||
      !order ||
      order.paymentMethod !== "RAZORPAY" ||
      order.status !== "PENDING_PAYMENT" ||
      autoAttempted.current
    ) {
      return;
    }
    autoAttempted.current = true;
    void payWithRazorpay();
  }, [shouldAutopay, order, payWithRazorpay]);

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

  // Still loading, or the hand-off effect above is about to redirect away —
  // never render this page's own payment UI for an order that isn't (or is
  // no longer) awaiting a Razorpay payment.
  if (!order || order.paymentMethod !== "RAZORPAY" || (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED")) {
    return <p className="py-16 text-center font-body text-sm text-text-secondary">Loading…</p>;
  }

  // The backend only accepts a new Razorpay attempt while the order is
  // still PENDING_PAYMENT (CreateRazorpayOrderUseCase) — once a webhook has
  // settled it to PAYMENT_FAILED, retrying here would just bounce off that
  // same rule, so the button doesn't offer it.
  const canRetry = order.status === "PENDING_PAYMENT";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center">
      <PaymentStatusHeading stage={stage} />

      <Card className="w-full p-5 text-left">
        <dl className="flex flex-col gap-2.5 font-body text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Order</dt>
            <dd className="text-text-primary">{order.orderNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Amount</dt>
            <dd className="text-text-primary">{formatPaiseAsInr(order.totalPaise)}</dd>
          </div>
        </dl>
      </Card>

      {canRetry && stage !== "confirming" ? (
        <Button onClick={() => void payWithRazorpay()} isLoading={stage === "awaiting-razorpay"}>
          {stage === "cancelled" || stage === "failed" ? "Try payment again" : "Pay now"}
        </Button>
      ) : null}

      <div className="flex gap-4">
        <Link href="/checkout" className="font-body text-sm text-primary hover:underline">
          Back to checkout
        </Link>
        <Link href="/account/orders" className="font-body text-sm text-primary hover:underline">
          View your orders
        </Link>
      </div>
    </div>
  );
}

function PaymentStatusHeading({ stage }: { stage: Stage }) {
  const iconProps = { className: "h-9 w-9 text-error", strokeWidth: 1.5, "aria-hidden": true } as const;

  if (stage === "confirming") {
    return (
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <h1 className="font-display text-2xl text-text-primary">Confirming your payment…</h1>
      </div>
    );
  }
  if (stage === "cancelled") {
    return (
      <div className="flex flex-col items-center gap-3">
        <PackageX {...iconProps} />
        <h1 className="font-display text-2xl text-text-primary">Payment cancelled</h1>
        <p className="max-w-xs font-body text-sm text-text-secondary">
          You closed the payment window before it completed. Your order has not been confirmed.
        </p>
      </div>
    );
  }
  if (stage === "failed") {
    return (
      <div className="flex flex-col items-center gap-3">
        <PackageX {...iconProps} />
        <h1 className="font-display text-2xl text-text-primary">Payment failed</h1>
        <p className="max-w-xs font-body text-sm text-text-secondary">
          Your payment could not be completed. Your order has not been confirmed.
        </p>
      </div>
    );
  }
  return <h1 className="font-display text-2xl text-text-primary">Complete your payment</h1>;
}
