"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, EmptyState } from "@woobe/ui";
import { Tag } from "lucide-react";
import Link from "next/link";
import type { AdminCoupon } from "../api/admin-coupons.client";

export function CouponsTable({ items }: { items: AdminCoupon[] }) {
  if (items.length === 0) {
    return <EmptyState icon={<Tag />} title="No coupons yet" description="Create a coupon to offer a discount at checkout." />;
  }

  return (
    <div className="overflow-x-auto rounded-control border border-border">
      <table className="w-full min-w-[760px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th scope="col" className="py-2 pl-4 pr-4">
              Code
            </th>
            <th scope="col" className="py-2 pr-4">
              Discount
            </th>
            <th scope="col" className="py-2 pr-4">
              Usage
            </th>
            <th scope="col" className="py-2 pr-4">
              Valid until
            </th>
            <th scope="col" className="py-2 pr-4">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((coupon) => (
            <tr key={coupon.id} className="border-b border-border last:border-0 hover:bg-primary-tint/30">
              <td className="py-2.5 pl-4 pr-4">
                <Link href={`/coupons/${coupon.id}`} className="font-medium text-primary hover:underline">
                  {coupon.code}
                </Link>
              </td>
              <td className="py-2.5 pr-4 text-text-primary">{formatDiscount(coupon)}</td>
              <td className="py-2.5 pr-4 text-text-secondary">
                {coupon.redemptionCount}
                {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ""}
              </td>
              <td className="py-2.5 pr-4 text-text-secondary">{new Date(coupon.validTo).toLocaleDateString("en-IN")}</td>
              <td className="py-2.5 pr-4">
                <Badge variant={coupon.isActive ? "success" : "neutral"}>{coupon.isActive ? "active" : "inactive"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDiscount(coupon: AdminCoupon): string {
  if (coupon.type === "PERCENTAGE") {
    return coupon.maxDiscountPaise !== null ? `${coupon.value}% (up to ${formatPaiseAsInr(coupon.maxDiscountPaise)})` : `${coupon.value}%`;
  }
  return formatPaiseAsInr(coupon.value);
}
