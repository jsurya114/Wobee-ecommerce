import { prisma } from "@woobe/database";
import type { ProductDetailEntity, ProductSummaryEntity, ProductVariantEntity } from "../../domain/entities/product.entity";
import type {
  ListProductsFilter,
  ListProductsResult,
  ProductRepositoryPort,
} from "../../application/ports/product-repository.port";

/**
 * ADR-010: the ONLY file in the products module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class ProductRepository implements ProductRepositoryPort {
  async findMany(filter: ListProductsFilter): Promise<ListProductsResult> {
    const where = { isActive: true, ...(filter.categoryId ? { categoryId: filter.categoryId } : {}) };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        // categoryId + minPricePaiseCache composite index (ADR-012) backs
        // this exact filter+sort path.
        orderBy: { minPricePaiseCache: "asc" },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          categoryId: true,
          minPricePaiseCache: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, altText: true, sortOrder: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const products: ProductSummaryEntity[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      categoryId: row.categoryId,
      minPricePaiseCache: row.minPricePaiseCache,
      primaryImage: row.images[0] ?? null,
    }));

    return { products, total };
  }

  async findBySlug(slug: string): Promise<ProductDetailEntity | null> {
    const row = await prisma.product.findUnique({
      where: { slug, isActive: true },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: "asc" }, select: { url: true, altText: true, sortOrder: true } },
        variants: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            sku: true,
            color: true,
            size: true,
            weightGrams: true,
            ratePerKgOverridePaise: true,
            isActive: true,
          },
        },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      brand: row.brand,
      category: row.category,
      images: row.images,
      variants: row.variants,
    };
  }

  async findVariantsByIds(
    variantIds: string[],
  ): Promise<(ProductVariantEntity & { productId: string; productName: string; productSlug: string; image: string | null })[]> {
    const rows = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        sku: true,
        color: true,
        size: true,
        weightGrams: true,
        ratePerKgOverridePaise: true,
        isActive: true,
        product: {
          select: { id: true, name: true, slug: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      color: row.color,
      size: row.size,
      weightGrams: row.weightGrams,
      ratePerKgOverridePaise: row.ratePerKgOverridePaise,
      isActive: row.isActive,
      productId: row.product.id,
      productName: row.product.name,
      productSlug: row.product.slug,
      image: row.product.images[0]?.url ?? null,
    }));
  }
}
