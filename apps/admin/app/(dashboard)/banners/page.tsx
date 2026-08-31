"use client";

import Link from "next/link";
import { BannersTable } from "@/features/banners/components/BannersTable";
import { useAdminBanners } from "@/features/banners/hooks/useAdminBanners";

export default function BannersPage() {
  const { items, loading, error, setActive, remove, reorder } = useAdminBanners();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">Banners</h1>
        <Link href="/banners/new" className="rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
          New banner
        </Link>
      </div>
      {loading ? (
        <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <BannersTable items={items} onSetActive={setActive} onRemove={remove} onReorder={reorder} />
      )}
    </div>
  );
}
