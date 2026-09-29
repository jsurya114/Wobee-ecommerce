"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import Link from "next/link";
import { OffersTable } from "@/features/offers/components/OffersTable";
import { useAdminOffers } from "@/features/offers/hooks/useAdminOffers";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function OffersPage() {
  const { items, loading, error } = useAdminOffers();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Offers"
        description="Automatic promotional pricing — storewide, by category, or on selected products."
        actions={
          <Link href="/offers/new" className="rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
            New offer
          </Link>
        }
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <OffersTable items={items} />
      )}
    </div>
  );
}
