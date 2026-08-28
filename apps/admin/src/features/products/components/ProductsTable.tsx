"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge } from "@woobe/ui";
import Link from "next/link";
import type { AdminProductSummary } from "../api/admin-products.client";

export function ProductsTable({ items }: { items: AdminProductSummary[] }) {
  if (items.length === 0) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">No products match these filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="py-2 pr-4">Product</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Variants</th>
            <th className="py-2 pr-4">From</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => (
            <tr key={product.id} className="border-b border-border hover:bg-primary-tint/30">
              <td className="py-3 pr-4">
                <Link href={`/products/${product.id}`} className="flex items-center gap-3 text-primary hover:underline">
                  {product.primaryImageUrl ? (
                    // Plain <img>, not next/image — admin table thumbnail of
                    // an arbitrary remote URL (uploaded media); configuring
                    // next/image's domain allowlist isn't worth it for an
                    // internal tool's small thumbnails.
                    <img src={product.primaryImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-control object-cover" />
                  ) : (
                    <span className="h-10 w-10 shrink-0 rounded-control bg-primary-tint/40" aria-hidden="true" />
                  )}
                  <span className="truncate">{product.name}</span>
                </Link>
              </td>
              <td className="py-3 pr-4 text-text-primary">{product.categoryName}</td>
              <td className="py-3 pr-4 text-text-primary">{product.variantCount}</td>
              <td className="py-3 pr-4 text-text-primary">{formatPaiseAsInr(product.minPricePaiseCache)}</td>
              <td className="py-3 pr-4">
                <Badge variant={product.isActive ? "success" : "neutral"}>{product.isActive ? "active" : "inactive"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
