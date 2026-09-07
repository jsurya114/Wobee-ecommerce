"use client";

import { Badge, EmptyState } from "@woobe/ui";
import { Users } from "lucide-react";
import Link from "next/link";
import type { AdminStaffSummary } from "../api/admin-staff.client";
import { STAFF_ROLE_LABELS, STAFF_STATUS_BADGE_VARIANT, STAFF_STATUS_LABELS } from "../lib/staff-labels";

function formatLastLogin(lastLoginAt: string | null): string {
  return lastLoginAt ? new Date(lastLoginAt).toLocaleString() : "Never";
}

/**
 * Desktop: a plain table, same shape as CustomersTable.tsx. Below `md`: a
 * stacked card list instead — the one genuinely new responsive pattern in
 * this admin app (every other table just scrolls horizontally), per the
 * staff-system spec's own "usable without horizontal overflow on small
 * screens" requirement. No new table/card framework, just conditional
 * Tailwind rendering of the same data twice.
 */
export function StaffTable({ items }: { items: AdminStaffSummary[] }) {
  if (items.length === 0) {
    return <EmptyState icon={<Users />} title="No staff found" description="Try a different search or filter." />;
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse font-body text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th scope="col" className="py-2 pr-4">
                Name
              </th>
              <th scope="col" className="py-2 pr-4">
                Email
              </th>
              <th scope="col" className="py-2 pr-4">
                Role
              </th>
              <th scope="col" className="py-2 pr-4">
                Status
              </th>
              <th scope="col" className="py-2 pr-4">
                Last login
              </th>
              <th scope="col" className="py-2 pr-4">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((staff) => (
              <tr key={staff.id} className="border-b border-border hover:bg-primary-tint/30">
                <td className="py-3 pr-4">
                  <Link href={`/staff/${staff.id}`} className="text-primary hover:underline">
                    {staff.name}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-text-primary">{staff.email}</td>
                <td className="py-3 pr-4 text-text-secondary">{STAFF_ROLE_LABELS[staff.role]}</td>
                <td className="py-3 pr-4">
                  <Badge variant={STAFF_STATUS_BADGE_VARIANT[staff.status]}>{STAFF_STATUS_LABELS[staff.status]}</Badge>
                </td>
                <td className="py-3 pr-4 text-text-secondary">{formatLastLogin(staff.lastLoginAt)}</td>
                <td className="py-3 pr-4 text-text-secondary">{new Date(staff.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {items.map((staff) => (
          <li key={staff.id} className="rounded-control border border-border p-3">
            <Link href={`/staff/${staff.id}`} className="flex items-center justify-between gap-2">
              <span className="truncate font-body text-sm font-medium text-primary">{staff.name}</span>
              <Badge variant={STAFF_STATUS_BADGE_VARIANT[staff.status]}>{STAFF_STATUS_LABELS[staff.status]}</Badge>
            </Link>
            <p className="mt-1 truncate font-body text-sm text-text-secondary">{staff.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-text-secondary">
              <span>{STAFF_ROLE_LABELS[staff.role]}</span>
              <span>Last login: {formatLastLogin(staff.lastLoginAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
