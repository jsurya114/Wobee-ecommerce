"use client";

import type { StaffRole } from "@woobe/validation";
import { Input } from "@woobe/ui";
import type { StaffStatus } from "../api/admin-staff.client";
import { STAFF_ROLE_LABELS, STAFF_STATUS_LABELS } from "../lib/staff-labels";

/** Mirrors CustomerFilters.tsx's shape exactly (plain Input + native selects). */
export function StaffFilters({
  search,
  role,
  status,
  onSearchChange,
  onRoleChange,
  onStatusChange,
}: {
  search: string;
  role: StaffRole | undefined;
  status: StaffStatus | undefined;
  onSearchChange: (search: string) => void;
  onRoleChange: (role: StaffRole | undefined) => void;
  onStatusChange: (status: StaffStatus | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        name="search"
        aria-label="Search staff by name or email"
        placeholder="Search name or email"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
      <select
        name="role"
        aria-label="Filter by role"
        value={role ?? ""}
        onChange={(e) => onRoleChange(e.target.value === "" ? undefined : (e.target.value as StaffRole))}
        className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
      >
        <option value="">All roles</option>
        {Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        name="status"
        aria-label="Filter by status"
        value={status ?? ""}
        onChange={(e) => onStatusChange(e.target.value === "" ? undefined : (e.target.value as StaffStatus))}
        className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
      >
        <option value="">All statuses</option>
        {Object.entries(STAFF_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
