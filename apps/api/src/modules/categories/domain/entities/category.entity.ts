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
