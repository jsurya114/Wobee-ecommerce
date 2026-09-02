"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import Link from "next/link";
import { CollectionsTable } from "@/features/collections/components/CollectionsTable";
import { useAdminCollections } from "@/features/collections/hooks/useAdminCollections";

export default function CollectionsPage() {
  const { items, loading, error } = useAdminCollections();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl text-text-primary">Collections</h1>
          <p className="font-body text-sm text-text-secondary">Curate products into storefront collections.</p>
        </div>
        <Link href="/collections/new" className="rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
          New collection
        </Link>
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <CollectionsTable items={items} />
      )}
    </div>
  );
}
