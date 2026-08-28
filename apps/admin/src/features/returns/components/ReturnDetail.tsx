"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, Card } from "@woobe/ui";
import { useAdminReturn } from "../hooks/useAdminReturn";
import { ReturnStatusActions } from "./ReturnStatusActions";

export function ReturnDetail({ returnId }: { returnId: string }) {
  const { detail, loading, error, approve, reject, issueRefund, markRefunded, lastRefundOutcome } = useAdminReturn(returnId);

  if (loading) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!detail) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Return not found.</p>;
  }

  const { return: ret, order } = detail;

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">Return request</h1>
        <Badge variant="neutral">{ret.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Requested items</h2>
        <div className="flex flex-col gap-2">
          {ret.items.map((line) => {
            const orderItem = order.items.find((oi) => oi.id === line.orderItemId);
            return (
              <div key={line.id} className="flex justify-between font-body text-sm">
                <span className="text-text-primary">
                  {orderItem?.productNameSnapshot ?? "Unknown item"} × {line.quantity}
                  {line.reasonDetail ? <span className="text-text-secondary"> — {line.reasonDetail}</span> : null}
                </span>
                {orderItem ? <span className="text-text-primary">{formatPaiseAsInr(orderItem.unitPricePaise * line.quantity)}</span> : null}
              </div>
            );
          })}
        </div>
        <p className="mt-3 border-t border-border pt-3 font-body text-sm text-text-secondary">
          <span className="font-medium text-text-primary">Reason: </span>
          {ret.reason}
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Order</h2>
        <dl className="flex flex-col gap-1 font-body text-sm">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Status</dt>
            <dd className="text-text-primary">{order.status.replace(/_/g, " ").toLowerCase()}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Delivered</dt>
            <dd className="text-text-primary">{order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString() : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Requested</dt>
            <dd className="text-text-primary">{new Date(ret.requestedAt).toLocaleDateString()}</dd>
          </div>
          {ret.resolvedAt ? (
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-text-secondary">Resolved</dt>
              <dd className="text-text-primary">{new Date(ret.resolvedAt).toLocaleDateString()}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <ReturnStatusActions
        ret={ret}
        onApprove={approve}
        onReject={reject}
        onIssueRefund={issueRefund}
        onMarkRefunded={markRefunded}
        lastRefundOutcome={lastRefundOutcome}
      />
    </div>
  );
}
