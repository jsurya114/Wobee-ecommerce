"use client";

import { resolveImageUrl } from "@/lib/resolve-image-url";
import { Badge, EmptyState } from "@woobe/ui";
import { FolderTree } from "lucide-react";
import Link from "next/link";
import type { AdminCategory } from "../api/admin-categories.client";

export function CategoriesTable({ items }: { items: AdminCategory[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FolderTree />}
        title="No categories yet"
        description="Create your first category to start organizing products."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-control border border-border">
      <table className="w-full min-w-[640px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th scope="col" className="py-2 pl-4 pr-4">
              Category
            </th>
            <th scope="col" className="py-2 pr-4">
              Slug
            </th>
            <th scope="col" className="py-2 pr-4">
              Products
            </th>
            <th scope="col" className="py-2 pr-4">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((category) => (
            <tr key={category.id} className="border-b border-border last:border-0 hover:bg-primary-tint/30">
              <td className="py-2.5 pl-4 pr-4">
                <Link href={`/categories/${category.id}`} className="flex items-center gap-3">
                  {category.imageUrl ? (
                    <img src={resolveImageUrl(category.imageUrl)!} alt="" className="h-9 w-9 shrink-0 rounded-control object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary-tint text-xs text-primary">
                      {category.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="font-medium text-primary hover:underline">{category.name}</span>
                </Link>
              </td>
              <td className="py-2.5 pr-4 text-text-secondary">{category.slug}</td>
              <td className="py-2.5 pr-4 text-text-primary">{category.productCount}</td>
              <td className="py-2.5 pr-4">
                <Badge variant={category.isActive ? "success" : "neutral"}>{category.isActive ? "active" : "inactive"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
