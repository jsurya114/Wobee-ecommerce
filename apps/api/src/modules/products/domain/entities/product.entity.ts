export interface ProductImageEntity {
  url: string;
  altText: string;
  sortOrder: number;
}

export interface ProductVariantEntity {
  id: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgOverridePaise: number | null;
  isActive: boolean;
}

export interface ProductSummaryEntity {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categoryId: string;
  /** Display/sort cache (ADR-012) — listing uses this, never checkout. */
  minPricePaiseCache: number;
  primaryImage: ProductImageEntity | null;
}

export interface ProductDetailEntity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: { id: string; name: string; slug: string };
  images: ProductImageEntity[];
  variants: ProductVariantEntity[];
}
