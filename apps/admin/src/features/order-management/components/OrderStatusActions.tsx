"use client";

import { Button, ConfirmationDialog, Input } from "@woobe/ui";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import { hasPermission } from "@/features/shell/nav-config";
import type { AdminOrderView, CancelRefundOutcome } from "../api/admin-orders.client";

interface Props {
  order: AdminOrderView;
  onStartProcessing: () => Promise<void>;
  onMarkPacked: () => Promise<void>;
  onShip: (input: { trackingNumber: string; carrier: string }) => Promise<void>;
  onDeliver: () => Promise<void>;
  onCancel: (input: { reason?: string }) => Promise<void>;
  onReturnToOrigin: () => Promise<void>;
  /** Outcome of a cancellation made in THIS session (null otherwise). */
  lastRefundOutcome: CancelRefundOutcome | null;
}

/** A status change waiting on the admin's confirmation (2026-09-28 — every transition goes through ConfirmationDialog). */
interface PendingAction {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  variant: "default" | "destructive";
  action: () => Promise<void>;
  successMessage: string;
}

export function OrderStatusActions({ order, onStartProcessing, onMarkPacked, onShip, onDeliver, onCancel, onReturnToOrigin, lastRefundOutcome }: Props) {
  const { user } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [reason, setReason] = useState("");

  if (!hasPermission(user?.role, "MANAGE_ORDERS")) {
    return null; // defense in depth — the API already enforces this; a staff member without the permission shouldn't see a live-looking button that 403s
  }

  const ref = order.orderNumber; // shown in every dialog — the order number staff recognise, never the UUID

  const runPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.action();
      toast.success(pending.successMessage);
      setShipping(false);
      setCancelling(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const dialog = (
    <ConfirmationDialog
      open={pending !== null}
      title={pending?.title ?? ""}
      description={pending?.description ?? ""}
      confirmLabel={pending?.confirmLabel ?? "Confirm"}
      variant={pending?.variant ?? "default"}
      isLoading={busy}
      onConfirm={runPending}
      onCancel={() => setPending(null)}
    />
  );

  const confirmProcessing = () =>
    setPending({
      title: "Start processing?",
      description: `Move order #${ref} to Processing? Fulfillment will begin.`,
      confirmLabel: "Mark as processing",
      variant: "default",
      action: onStartProcessing,
      successMessage: "Order moved to processing",
    });

  const confirmPacked = () =>
    setPending({
      title: "Mark as packed?",
      description: `Mark #${ref} as Packed?`,
      confirmLabel: "Mark packed",
      variant: "default",
      action: onMarkPacked,
      successMessage: "Order marked as packed",
    });

  const confirmShipment = () => {
    const tracking = trackingNumber.trim();
    const via = carrier.trim();
    setPending({
      title: "Confirm shipment?",
      description: `Ship #${ref} with tracking ${tracking} via ${via}? Customer will be notified.`,
      confirmLabel: "Confirm shipment",
      variant: "default",
      action: () => onShip({ trackingNumber: tracking, carrier: via }),
      successMessage: "Order marked as shipped",
    });
  };

  const confirmDelivered = () =>
    setPending({
      title: "Mark as delivered?",
      description: `Mark #${ref} as Delivered? This cannot be undone.${
        order.paymentMethod === "COD" ? " Cash-on-delivery payment will be recorded as collected." : ""
      }`,
      confirmLabel: "Mark as delivered",
      variant: "destructive",
      action: onDeliver,
      successMessage: "Order marked as delivered",
    });

  const confirmCancellation = () => {
    const trimmedReason = reason.trim();
    setPending({
      title: "Cancel this order?",
      description: `Cancel #${ref}? Inventory will be restocked and refund initiated for anything paid online. This cannot be undone.`,
      confirmLabel: "Cancel order",
      variant: "destructive",
      action: () => onCancel({ reason: trimmedReason || undefined }),
      successMessage: "Order cancelled",
    });
  };

  const confirmReturnToOrigin = () =>
    setPending({
      title: "Mark delivery failed?",
      description: (
        <>
          <p>Mark #{ref} as returned to origin?</p>
          <p className="mt-2">
            The shipment could not be delivered and is being returned to Woobe. This restocks the item(s) and — for a cash-on-delivery order —
            leaves the payment as pending, since Woobe never collected it.
          </p>
        </>
      ),
      confirmLabel: "Mark delivery failed",
      variant: "destructive",
      action: onReturnToOrigin,
      successMessage: "Order marked as returned to origin",
    });

  if (order.status === "CONFIRMED") {
    return (
      // Buttons and the cancel-form each in their own row (matches the
      // PROCESSING branch below) — all three used to sit in one
      // non-wrapping `flex gap-2` row, which pushed the reason input and
      // confirm button off-screen at 375px. Not a plain page-overflow bug:
      // `overflow-x-hidden` on the dashboard's content wrapper (added
      // fixing the missing-viewport bug) silently clipped it instead of
      // producing a scrollbar, so `scrollWidth === innerWidth` reported no
      // problem even with content genuinely unreachable — caught only by
      // actually opening the form and looking at a screenshot, not by the
      // overflow-width check alone.
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={confirmProcessing} disabled={busy}>
            Mark as processing
          </Button>
          <Button variant="secondary" onClick={() => setCancelling(true)} disabled={busy}>
            Cancel order
          </Button>
        </div>
        {cancelling ? renderCancelForm() : null}
        {dialog}
      </div>
    );
  }

  if (order.status === "PROCESSING") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={confirmPacked} disabled={busy}>
            Mark packed
          </Button>
          <Button variant="secondary" onClick={() => setCancelling(true)} disabled={busy}>
            Cancel order
          </Button>
        </div>
        {cancelling ? renderCancelForm() : null}
        {dialog}
      </div>
    );
  }

  // 2026-09-06 order-processing audit — the PACKED checkpoint. Shipping
  // (tracking/carrier capture) now only happens from here, never straight
  // from PROCESSING (ShipOrderUseCase itself rejects that server-side; this
  // branch just means the button to attempt it doesn't exist before PACKED).
  if (order.status === "PACKED") {
    return (
      <div className="flex flex-col gap-3">
        <Button onClick={() => setShipping(true)} disabled={busy}>
          Mark as shipped
        </Button>
        {shipping ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <Input placeholder="Tracking number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            <Input placeholder="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            <Button onClick={confirmShipment} disabled={busy || !trackingNumber.trim() || !carrier.trim()}>
              Confirm shipment
            </Button>
          </div>
        ) : null}
        {dialog}
      </div>
    );
  }

  if (order.status === "SHIPPED") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={confirmDelivered} disabled={busy}>
            Mark as delivered
          </Button>
          <Button variant="secondary" onClick={confirmReturnToOrigin} disabled={busy}>
            Mark delivery failed / RTO
          </Button>
        </div>
        {dialog}
      </div>
    );
  }

  // Bug fix (2026-09-28): this used to key off `refundIssued === false`, which
  // is ALSO what a COD cancel returns (nothing was ever collected, so nothing
  // to refund) — every successful COD cancellation showed this red warning
  // and looked like it had failed. Only a genuinely failed refund attempt
  // needs a human now.
  if (order.status === "CANCELLED" && lastRefundOutcome === "FAILED") {
    return <p className="font-body text-sm text-error">Order cancelled, but the refund needs manual follow-up — the automatic attempt didn&apos;t succeed.</p>;
  }
  if (order.status === "CANCELLED" && lastRefundOutcome === "COMPLETED") {
    return <p className="font-body text-sm text-success">Order cancelled and refund issued.</p>;
  }

  return null;

  function renderCancelForm() {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="secondary" onClick={confirmCancellation} disabled={busy}>
          Confirm cancellation
        </Button>
      </div>
    );
  }
}
