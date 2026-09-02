"use client";

import { Button, Input } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { listProducts } from "@/features/products/api/admin-products.client";
import type { AdminProductSummary } from "@/features/products/api/admin-products.client";
import { ApiError } from "@/lib/api-client";

/** week2 (1).md §16's own note that a Day 7 product picker was owed to the collections admin UI (deferred since Day 2, see collections.module.ts's doc comment) — search-then-assign, not a full catalogue browser. */
export function ProductPicker({ excludeProductIds, onAssign }: { excludeProductIds: string[]; onAssign: (productId: string) => Promise<void> }) {
  const { withFreshToken } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminProductSummary[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    setIsSearching(true);
    try {
      const result = await withFreshToken((token) => listProducts({ search: search.trim(), pageSize: 20 }, token));
      setResults(result.items.filter((p) => !excludeProductIds.includes(p.id)));
    } catch {
      toast.error("Search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  const assign = async (productId: string) => {
    setAssigningId(productId);
    try {
      await onAssign(productId);
      setResults((prev) => prev?.filter((p) => p.id !== productId) ?? null);
      toast.success("Product added to collection");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't add that product.");
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={runSearch} className="flex gap-2">
        <Input
          aria-label="Search products to add"
          placeholder="Search products to add"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary" size="sm" isLoading={isSearching}>
          Search
        </Button>
      </form>
      {results ? (
        results.length === 0 ? (
          <p className="font-body text-sm text-text-secondary">No matching products.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 rounded-control border border-border p-2">
                <span className="truncate font-body text-sm text-text-primary">{product.name}</span>
                <Button size="sm" isLoading={assigningId === product.id} onClick={() => void assign(product.id)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
