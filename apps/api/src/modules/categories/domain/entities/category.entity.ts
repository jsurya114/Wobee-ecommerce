export interface CategoryEntity {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  /** Admin/seed-set category art (schema's own `Category.imageUrl`). The homepage rail prefers this over its derived-from-a-product fallback. */
  imageUrl: string | null;
}

/**
 * Admin management view (2026-09-02) — adds isActive and a cheap product
 * count (single query via Prisma `_count`, not N+1) that the public
 * CategoryEntity above has no use for.
 *
 * pricingMode REMOVED (2026-09-14) — it lived here as a hard per-category
 * rule until this date; it's now a per-PRODUCT attribute instead
 * (Product.pricingMode) so admin can set it independently of category. See
 * PricingMode's own doc comment in schema.prisma for the full rationale.
 */
export interface AdminCategoryEntity {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  imageUrl: string | null;
  isActive: boolean;
  productCount: number;
}
