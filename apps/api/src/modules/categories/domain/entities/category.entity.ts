export interface CategoryEntity {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  /** Admin/seed-set category art (schema's own `Category.imageUrl`). The homepage rail prefers this over its derived-from-a-product fallback. */
  imageUrl: string | null;
}
