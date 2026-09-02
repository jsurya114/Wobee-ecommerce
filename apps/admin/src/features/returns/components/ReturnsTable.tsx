"use client";

import { Badge, EmptyState } from "@woobe/ui";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import type { AdminReturnSummaryView } from "../api/admin-returns.client";

const STATUS_VARIANT: Record<string, "success" | "error" | "neutral"> = {
  REFUNDED: "success",
  RETURN_REJECTED: "error",
};

export function ReturnsTable({ items }: { items: AdminReturnSummaryView[] }) {
  if (items.length === 0) {
    return <EmptyState icon={<RotateCcw />} title="No returns found" description="Try a different search or filter." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th scope="col" className="py-2 pr-4">
              Order
            </th>
            <th scope="col" className="py-2 pr-4">
              Customer
            </th>
            <th scope="col" className="py-2 pr-4">
              Items
            </th>
            <th scope="col" className="py-2 pr-4">
              Reason
            </th>
            <th scope="col" className="py-2 pr-4">
              Status
            </th>
            <th scope="col" className="py-2 pr-4">
              Requested
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((ret) => (
            <tr key={ret.id} className="border-b border-border hover:bg-primary-tint/30">
              <td className="py-3 pr-4">
                <Link href={`/returns/${ret.id}`} className="text-primary hover:underline">
                  {ret.orderNumber}
                </Link>
              </td>
              <td className="py-3 pr-4 text-text-primary">
                {ret.contactName}
                <div className="text-xs text-text-secondary">{ret.contactEmail}</div>
              </td>
              <td className="py-3 pr-4 text-text-primary">{ret.itemCount}</td>
              <td className="max-w-xs truncate py-3 pr-4 text-text-primary">{ret.reason}</td>
              <td className="py-3 pr-4">
                <Badge variant={STATUS_VARIANT[ret.status] ?? "neutral"}>{ret.status.replace(/_/g, " ").toLowerCase()}</Badge>
              </td>
              <td className="py-3 pr-4 text-text-secondary">{new Date(ret.requestedAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
