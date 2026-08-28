"use client";

import { Badge } from "@woobe/ui";
import Link from "next/link";
import type { AdminCollection } from "../api/admin-collections.client";

export function CollectionsTable({ items }: { items: AdminCollection[] }) {
  if (items.length === 0) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">No collections yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Slug</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((collection) => (
            <tr key={collection.id} className="border-b border-border hover:bg-primary-tint/30">
              <td className="py-3 pr-4">
                <Link href={`/collections/${collection.id}`} className="text-primary hover:underline">
                  {collection.name}
                </Link>
              </td>
              <td className="py-3 pr-4 text-text-primary">{collection.slug}</td>
              <td className="py-3 pr-4">
                <Badge variant={collection.isActive ? "success" : "neutral"}>{collection.isActive ? "active" : "inactive"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
