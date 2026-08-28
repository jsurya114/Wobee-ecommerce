"use client";

import { Button, Input } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import { hasPermission } from "@/features/shell/nav-config";
import type { AdminReturnEntity, IssueRefundResult } from "../api/admin-returns.client";

interface Props {
  ret: AdminReturnEntity;
  onApprove: () => Promise<void>;
  onReject: (input: { reason?: string }) => Promise<void>;
  onIssueRefund: () => Promise<void>;
  onMarkRefunded: () => Promise<void>;
  lastRefundOutcome: IssueRefundResult["outcome"] | null;
}

/**
 * Buttons and any revealed sub-form each in their own `flex-col`/
 * `flex-wrap` row from the start — the Day 5 admin-viewport audit's own
 * lesson (OrderStatusActions' CONFIRMED branch originally put both in one
 * non-wrapping row, clipping off-screen at 375px) applied here up front
 * rather than found and fixed after the fact.
 */
export function ReturnStatusActions({ ret, onApprove, onReject, onIssueRefund, onMarkRefunded, lastRefundOutcome }: Props) {
  const { user } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  if (!hasPermission(user?.role, "MANAGE_ORDERS")) {
    return null; // defense in depth — the API already enforces this
  }

  const run = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      setRejecting(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  if (ret.status === "RETURN_REQUESTED") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void run(onApprove, "Return approved")} isLoading={busy}>
            Approve
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>
            Reject
          </Button>
        </div>
        {rejecting ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="secondary" onClick={() => void run(() => onReject({ reason: reason || undefined }), "Return rejected")} isLoading={busy}>
              Confirm rejection
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (ret.status === "RETURN_APPROVED") {
    return (
      <Button onClick={() => void run(onIssueRefund, "Refund initiated")} isLoading={busy}>
        Issue refund
      </Button>
    );
  }

  if (ret.status === "REFUND_INITIATED") {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-body text-sm text-text-secondary">
          {lastRefundOutcome === "not-applicable"
            ? "This order was Cash on Delivery — no gateway refund to process. Once you've refunded the customer manually, confirm it below."
            : lastRefundOutcome === "failed"
              ? "The automatic refund attempt didn't succeed. Once you've completed it manually (e.g. via the Razorpay dashboard), confirm it below."
              : "Awaiting refund completion."}
        </p>
        <Button onClick={() => void run(onMarkRefunded, "Return marked as refunded")} isLoading={busy} className="self-start">
          Mark as refunded
        </Button>
      </div>
    );
  }

  return null;
}
