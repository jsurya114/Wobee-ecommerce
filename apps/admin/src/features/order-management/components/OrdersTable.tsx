"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge } from "@woobe/ui";
import Link from "next/link";
import type { AdminOrderSummaryView } from "../api/admin-orders.client";

const STATUS_VARIANT: Record<string, "success" | "error" | "neutral"> = {
  DELIVERED: "success",
  CONFIRMED: "success",
  PAYMENT_FAILED: "error",
  CANCELLED: "error",
};

export function OrdersTable({ items }: { items: AdminOrderSummaryView[] }) {
  if (items.length === 0) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">No orders match these filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="py-2 pr-4">Order</th>
            <th className="py-2 pr-4">Customer</th>
            <th className="py-2 pr-4">Items</th>
            <th className="py-2 pr-4">Total</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Placed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id} className="border-b border-border hover:bg-primary-tint/30">
              <td className="py-3 pr-4">
                <Link href={`/orders/${order.id}`} className="text-primary hover:underline">
                  {order.orderNumber}
                </Link>
              </td>
              <td className="py-3 pr-4 text-text-primary">
                {order.contactName}
                <div className="text-xs text-text-secondary">{order.contactEmail}</div>
              </td>
              <td className="py-3 pr-4 text-text-primary">{order.itemCount}</td>
              <td className="py-3 pr-4 text-text-primary">{formatPaiseAsInr(order.totalPaise)}</td>
              <td className="py-3 pr-4">
                <Badge variant={STATUS_VARIANT[order.status] ?? "neutral"}>{order.status.replace(/_/g, " ").toLowerCase()}</Badge>
              </td>
              <td className="py-3 pr-4 text-text-secondary">{new Date(order.placedAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
