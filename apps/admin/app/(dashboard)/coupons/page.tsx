"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import Link from "next/link";
import { CouponsTable } from "@/features/coupons/components/CouponsTable";
import { useAdminCoupons } from "@/features/coupons/hooks/useAdminCoupons";

export default function CouponsPage() {
  const { items, loading, error } = useAdminCoupons();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl text-text-primary">Coupons</h1>
          <p className="font-body text-sm text-text-secondary">Percentage and flat-amount discount codes, with usage limits.</p>
        </div>
        <Link href="/coupons/new" className="rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
          New coupon
        </Link>
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <CouponsTable items={items} />
      )}
    </div>
  );
}
