import type { PricingMode } from "@woobe/types";

export interface CategoryEntity {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  /** Admin/seed-set category art (schema's own `Category.imageUrl`). The homepage rail prefers this over its derived-from-a-product fallback. */
  imageUrl: string | null;
  /** Hard rule (2026-08-31): every product in this category is priced this way. See PricingMode's own doc comment in schema.prisma. */
  pricingMode: PricingMode;
}

/**
 * Admin management view (2026-09-02) — adds isActive and a cheap product
 * count (single query via Prisma `_count`, not N+1) that the public
 * CategoryEntity above has no use for. pricingMode is intentionally NOT
 * admin-editable here — changing it on a category with existing products
 * would silently reprice them; it stays a seed/migration-only concern.
 */
export interface AdminCategoryEntity {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  imageUrl: string | null;
  isActive: boolean;
  pricingMode: PricingMode;
  productCount: number;
}
