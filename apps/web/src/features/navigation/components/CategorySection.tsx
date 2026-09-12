"use client";

import { cn } from "@woobe/ui";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { buildProductsHref } from "@/features/catalog/lib/build-products-href";
import { useNavCategories } from "../hooks/useNavCategories";

/**
 * Categories are a flat list server-side (`Category` has no parent/child
 * relationship) — so "expandable" here means one disclosure revealing that
 * flat, active-only list, not a multi-level tree. Renders nothing while
 * loading resolves to zero categories, rather than an empty disclosure.
 */
export function CategorySection({ onNavigate }: { onNavigate: () => void }) {
  const { categories, isLoading } = useNavCategories();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  if (!isLoading && categories.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between rounded-control px-2 py-2.5 font-body text-sm text-text-primary transition-colors hover:bg-surface-2 hover:text-primary"
      >
        Categories
        <ChevronDown
          className={cn("h-4 w-4 text-text-secondary transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <div id={panelId} className={cn("flex-col gap-0.5 py-1 pl-3", expanded ? "flex" : "hidden")}>
        {isLoading ? (
          <p className="px-2 py-1.5 font-body text-xs text-text-secondary">Loading categories…</p>
        ) : (
          categories.map((category) => (
            <Link
              key={category.id}
              href={buildProductsHref({ category: category.slug })}
              onClick={onNavigate}
              className="rounded-control px-2 py-2 font-body text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
            >
              {category.name}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
