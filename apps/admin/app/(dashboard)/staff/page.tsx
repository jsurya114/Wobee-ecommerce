"use client";

import type { StaffRole } from "@woobe/validation";
import Link from "next/link";
import { useState } from "react";
import { LoadingState } from "@/features/shell/components/LoadingState";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { StaffStatus } from "@/features/staff/api/admin-staff.client";
import { StaffFilters } from "@/features/staff/components/StaffFilters";
import { StaffTable } from "@/features/staff/components/StaffTable";
import { useAdminStaffList } from "@/features/staff/hooks/useAdminStaffList";

export default function StaffPage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<StaffRole | undefined>(undefined);
  const [status, setStatus] = useState<StaffStatus | undefined>(undefined);
  const debouncedSearch = useDebouncedValue(search);
  const { items, loading, error } = useAdminStaffList({ search: debouncedSearch || undefined, role, status });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl text-text-primary">Staff</h1>
          <p className="font-body text-sm text-text-secondary">Manage admin team members and their access.</p>
        </div>
        <Link href="/staff/new" className="rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white hover:bg-primary-hover">
          Add staff
        </Link>
      </div>
      <StaffFilters search={search} role={role} status={status} onSearchChange={setSearch} onRoleChange={setRole} onStatusChange={setStatus} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <StaffTable items={items} />
      )}
    </div>
  );
}
