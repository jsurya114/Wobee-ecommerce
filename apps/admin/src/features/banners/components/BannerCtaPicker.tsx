"use client";

import { useQuery } from "@tanstack/react-query";
import { FormField, Input, Label, cn } from "@woobe/ui";
import type { BannerCtaAction } from "@woobe/validation";
import { useId, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { useAdminCollections } from "@/features/collections/hooks/useAdminCollections";
import { getProduct } from "@/features/products/api/admin-products.client";
import { useAdminCategories } from "@/features/products/hooks/useAdminCategories";
import { useAdminProducts } from "@/features/products/hooks/useAdminProducts";
import { useDebouncedValue } from "@/lib/use-debounced-value";

type ActionType = BannerCtaAction["type"];

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
  { value: "NONE", label: "No link" },
  { value: "CATEGORY", label: "A category" },
  { value: "COLLECTION", label: "A collection" },
  { value: "PRODUCT", label: "A product" },
  { value: "OFFERS", label: "All offers" },
  { value: "NEW_ARRIVALS", label: "New arrivals" },
  { value: "CUSTOM_URL", label: "Custom link (advanced)" },
];

const selectClass =
  "h-11 w-full rounded-control border bg-surface px-4 font-body text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** The empty/initial action for a newly chosen type — selections that need a target start unselected. */
function emptyAction(type: ActionType): BannerCtaAction {
  switch (type) {
    case "CATEGORY":
    case "COLLECTION":
    case "PRODUCT":
      return { type, id: "" };
    case "CUSTOM_URL":
      return { type, url: "" };
    default:
      return { type } as BannerCtaAction;
  }
}

/**
 * Banner CTA as a preset ACTION instead of a hand-typed URL (2026-09-28). The
 * admin picks what the banner opens; the API stores a reference (e.g.
 * "category:<id>") and resolves it to the live storefront path on every read,
 * so renaming a category's slug never breaks a banner. "Custom link" remains
 * for power users and is validated server-side like any link.
 */
export function BannerCtaPicker({ value, onChange, error }: { value: BannerCtaAction; onChange: (next: BannerCtaAction) => void; error?: string }) {
  const typeId = useId();
  const targetId = useId();
  const { categories, loading: categoriesLoading } = useAdminCategories();
  const { items: collections, loading: collectionsLoading } = useAdminCollections();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={typeId}>Banner opens</Label>
        <select
          id={typeId}
          name="ctaActionType"
          value={value.type}
          onChange={(e) => onChange(emptyAction(e.target.value as ActionType))}
          className={cn(selectClass, "border-border")}
        >
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {value.type === "CATEGORY" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={targetId}>Category</Label>
          <select
            id={targetId}
            name="ctaCategory"
            value={value.id}
            disabled={categoriesLoading}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange({ type: "CATEGORY", id: e.target.value })}
            className={cn(selectClass, error ? "border-error" : "border-border")}
          >
            <option value="">{categoriesLoading ? "Loading…" : "Choose a category"}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {value.type === "COLLECTION" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={targetId}>Collection</Label>
          <select
            id={targetId}
            name="ctaCollection"
            value={value.id}
            disabled={collectionsLoading}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange({ type: "COLLECTION", id: e.target.value })}
            className={cn(selectClass, error ? "border-error" : "border-border")}
          >
            <option value="">{collectionsLoading ? "Loading…" : "Choose a collection"}</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
                {collection.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {value.type === "PRODUCT" ? <ProductTargetPicker productId={value.id} onChange={(id) => onChange({ type: "PRODUCT", id })} hasError={Boolean(error)} /> : null}

      {value.type === "CUSTOM_URL" ? (
        <FormField
          label="Link"
          value={value.url}
          placeholder="/products?size=M or https://…"
          onChange={(e) => onChange({ type: "CUSTOM_URL", url: e.target.value })}
          helperText={error ? undefined : "A site path starting with / or a full https:// link."}
        />
      ) : null}

      {error ? (
        <p role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Search-as-you-type product picker (debounced, server-side search, first 20 matches) that also shows the currently selected product's name. */
function ProductTargetPicker({ productId, onChange, hasError }: { productId: string; onChange: (id: string) => void; hasError: boolean }) {
  const searchId = useId();
  const { withFreshToken } = useAdminAuth();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const { items, loading } = useAdminProducts({ search: debouncedSearch || undefined, isActive: true, pageSize: 20 });
  const selected = useQuery({
    queryKey: ["admin", "products", "detail", productId],
    queryFn: () => withFreshToken((token) => getProduct(productId, token)),
    enabled: productId !== "",
  });
  const selectedName = selected.data?.product.name;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={searchId}>Product</Label>
      {productId ? (
        <p className="font-body text-sm text-text-secondary">
          Selected: <span className="font-medium text-text-primary">{selectedName ?? (selected.isError ? "a product that no longer exists" : "…")}</span>
        </p>
      ) : null}
      <Input id={searchId} value={search} placeholder="Search products by name" invalid={hasError && !productId} onChange={(e) => setSearch(e.target.value)} />
      <ul className="max-h-56 overflow-y-auto rounded-control border border-border" aria-label="Matching products">
        {loading ? (
          <li className="px-3 py-2 font-body text-sm text-text-secondary">Searching…</li>
        ) : items.length === 0 ? (
          <li className="px-3 py-2 font-body text-sm text-text-secondary">No matching active products.</li>
        ) : (
          items.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                aria-pressed={product.id === productId}
                onClick={() => onChange(product.id)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left font-body text-sm hover:bg-primary-tint/50",
                  product.id === productId && "bg-primary-tint font-medium text-primary",
                )}
              >
                <span>{product.name}</span>
                <span className="text-xs text-text-secondary">{product.categoryName}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
