"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import Link from "next/link";
import { CouponsTable } from "@/features/coupons/components/CouponsTable";
import { useAdminCoupons } from "@/features/coupons/hooks/useAdminCoupons";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function CouponsPage() {
  const { items, loading, error } = useAdminCoupons();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Coupons"
        description="Percentage and flat-amount discount codes, with usage limits."
        actions={
          <Link href="/coupons/new" className="rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
            New coupon
          </Link>
        }
      />
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
