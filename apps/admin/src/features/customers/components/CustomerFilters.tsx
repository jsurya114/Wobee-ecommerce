"use client";

import { Input } from "@woobe/ui";

export function CustomerFilters({
  search,
  isActive,
  onSearchChange,
  onActiveChange,
}: {
  search: string;
  isActive: boolean | undefined;
  onSearchChange: (search: string) => void;
  onActiveChange: (isActive: boolean | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        name="search"
        aria-label="Search customers by name or email"
        placeholder="Search name or email"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
      <select
        name="isActive"
        aria-label="Filter by account status"
        value={isActive === undefined ? "" : String(isActive)}
        onChange={(e) => onActiveChange(e.target.value === "" ? undefined : e.target.value === "true")}
        className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
      >
        <option value="">All statuses</option>
        <option value="true">Active</option>
        <option value="false">Deactivated</option>
      </select>
    </div>
  );
}
