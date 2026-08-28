"use client";

import { Badge } from "@woobe/ui";
import Link from "next/link";
import type { AdminCustomerSummary } from "../api/admin-customers.client";

export function CustomersTable({ items }: { items: AdminCustomerSummary[] }) {
  if (items.length === 0) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">No customers match these filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Joined</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((customer) => (
            <tr key={customer.id} className="border-b border-border hover:bg-primary-tint/30">
              <td className="py-3 pr-4">
                <Link href={`/customers/${customer.id}`} className="text-primary hover:underline">
                  {customer.name}
                </Link>
              </td>
              <td className="py-3 pr-4 text-text-primary">{customer.email}</td>
              <td className="py-3 pr-4 text-text-secondary">{new Date(customer.createdAt).toLocaleDateString()}</td>
              <td className="py-3 pr-4">
                <Badge variant={customer.isActive ? "success" : "error"}>{customer.isActive ? "active" : "deactivated"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
