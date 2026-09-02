"use client";

import { Badge, EmptyState } from "@woobe/ui";
import { Layers } from "lucide-react";
import Link from "next/link";
import type { AdminCollection } from "../api/admin-collections.client";

export function CollectionsTable({ items }: { items: AdminCollection[] }) {
  if (items.length === 0) {
    return <EmptyState icon={<Layers />} title="No collections yet" description="Group products into a collection to feature them together." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th scope="col" className="py-2 pr-4">
              Name
            </th>
            <th scope="col" className="py-2 pr-4">
              Slug
            </th>
            <th scope="col" className="py-2 pr-4">
              Status
            </th>
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
