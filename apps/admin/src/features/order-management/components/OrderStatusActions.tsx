"use client";

import { Button, Input } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import { hasPermission } from "@/features/shell/nav-config";
import type { AdminOrderView } from "../api/admin-orders.client";

interface Props {
  order: AdminOrderView;
  onStartProcessing: () => Promise<void>;
  onShip: (input: { trackingNumber: string; carrier: string }) => Promise<void>;
  onDeliver: () => Promise<void>;
  onCancel: (input: { reason?: string }) => Promise<void>;
  lastRefundIssued: boolean | null;
}

export function OrderStatusActions({ order, onStartProcessing, onShip, onDeliver, onCancel, lastRefundIssued }: Props) {
  const { user } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [reason, setReason] = useState("");

  if (!hasPermission(user?.role, "MANAGE_ORDERS")) {
    return null; // defense in depth — the API already enforces this; a staff member without the permission shouldn't see a live-looking button that 403s
  }

  const run = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      setShipping(false);
      setCancelling(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

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
          <Button onClick={() => void run(onStartProcessing, "Order moved to processing")} isLoading={busy}>
            Mark as processing
          </Button>
          <Button variant="secondary" onClick={() => setCancelling(true)} disabled={busy}>
            Cancel order
          </Button>
        </div>
        {cancelling ? renderCancelForm() : null}
      </div>
    );
  }

  if (order.status === "PROCESSING") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button onClick={() => setShipping(true)} disabled={busy}>
            Mark as shipped
          </Button>
          <Button variant="secondary" onClick={() => setCancelling(true)} disabled={busy}>
            Cancel order
          </Button>
        </div>
        {shipping ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <Input placeholder="Tracking number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            <Input placeholder="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            <Button
              onClick={() => void run(() => onShip({ trackingNumber, carrier }), "Order marked as shipped")}
              isLoading={busy}
              disabled={!trackingNumber || !carrier}
            >
              Confirm shipment
            </Button>
          </div>
        ) : null}
        {cancelling ? renderCancelForm() : null}
      </div>
    );
  }

  if (order.status === "SHIPPED") {
    return (
      <Button onClick={() => void run(onDeliver, "Order marked as delivered")} isLoading={busy}>
        Mark as delivered
      </Button>
    );
  }

  if (lastRefundIssued === false && order.status === "CANCELLED") {
    return <p className="font-body text-sm text-error">Refund needs manual follow-up — the automatic attempt didn't succeed.</p>;
  }

  return null;

  function renderCancelForm() {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="secondary" onClick={() => void run(() => onCancel({ reason: reason || undefined }), "Order cancelled")} isLoading={busy}>
          Confirm cancellation
        </Button>
      </div>
    );
  }
}
