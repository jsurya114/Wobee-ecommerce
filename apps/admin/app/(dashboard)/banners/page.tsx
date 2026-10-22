"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import Link from "next/link";
import { BannersTable } from "@/features/banners/components/BannersTable";
import { useAdminBanners } from "@/features/banners/hooks/useAdminBanners";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function BannersPage() {
  const { items, loading, error, setActive, remove, reorder } = useAdminBanners();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Banners"
        description="Manage the homepage promotional carousel."
        actions={
          <Link href="/banners/new" className="rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
            New banner
          </Link>
        }
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <BannersTable items={items} onSetActive={setActive} onRemove={remove} onReorder={reorder} />
      )}
    </div>
  );
}
