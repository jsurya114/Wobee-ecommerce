export * from "./enums";

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductSummary {
  id: string;
  title: string;
  slug: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  weightGrams: number;
  ratePerKgPaise: number;
  pricePaise: number;
  compareAtPricePaise?: number | null;
  primaryImage?: {
    url: string;
    alt?: string | null;
  } | null;
  rating?: number;
  reviewCount?: number;
  inStock: boolean;
}

export interface ProductVariantDto {
  id: string;
  sku: string;
  size: string;
  color?: string | null;
  stockQuantity: number;
  inStock: boolean;
}

export interface ProductDetailDto {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  weightGrams: number;
  ratePerKgPaise: number;
  pricePaise: number;
  compareAtPricePaise?: number | null;
  gstRate: number;
  images: Array<{
    id: string;
    url: string;
    alt?: string | null;
    sortOrder: number;
    isPrimary: boolean;
  }>;
  variants: ProductVariantDto[];
  rating?: number;
  reviewCount?: number;
}
