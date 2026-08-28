import { Prisma, prisma } from "@woobe/database";
import type { ProductDetailEntity, ProductSummaryEntity, ProductVariantEntity } from "../../domain/entities/product.entity";
import type {
  ListProductsFilter,
  ListProductsResult,
  ProductRepositoryPort,
  ProductSummaryWithStatus,
} from "../../application/ports/product-repository.port";

/**
 * ADR-010: the ONLY file in the products module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class ProductRepository implements ProductRepositoryPort {
  async findMany(filter: ListProductsFilter): Promise<ListProductsResult> {
    const where = this.buildWhere(filter);

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        // `id` tiebreaker on every branch keeps pagination stable (Week 2
        // Day 1 requirement) even when many rows share the same price/date —
        // without it, two pages fetched moments apart can return the same
        // row twice or skip one, since Postgres doesn't otherwise guarantee
        // a deterministic order among ties.
        orderBy: this.buildOrderBy(filter.sort),
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

  /**
   * Every filter is AND'd together; size/color are each OR'd within
   * themselves (independent facets — see ListProductsUseCase's own comment
   * on why a size + color combo isn't required to be the same variant).
   * `search` is a plain `contains`/insensitive match — Postgres' planner
   * uses the `products_name_trgm_idx` GIN index (pg_trgm, ADR-012) to
   * accelerate this exact ILIKE '%term%' shape; no raw SQL needed here.
   */
  private buildWhere(filter: ListProductsFilter): Prisma.ProductWhereInput {
    const and: Prisma.ProductWhereInput[] = [];

    if (filter.categoryId) and.push({ categoryId: filter.categoryId });
    if (filter.collectionId) and.push({ collections: { some: { collectionId: filter.collectionId } } });
    if (filter.search) and.push({ name: { contains: filter.search, mode: "insensitive" } });
    if (filter.sizes?.length) and.push({ variants: { some: { isActive: true, size: { in: filter.sizes } } } });
    if (filter.colors?.length) and.push({ variants: { some: { isActive: true, color: { in: filter.colors } } } });
    if (filter.inStockVariantIds) {
      and.push({ variants: { some: { isActive: true, id: { in: filter.inStockVariantIds } } } });
    }
    if (filter.minPricePaise !== undefined) and.push({ minPricePaiseCache: { gte: filter.minPricePaise } });
    if (filter.maxPricePaise !== undefined) and.push({ minPricePaiseCache: { lte: filter.maxPricePaise } });

    return { isActive: true, ...(and.length > 0 ? { AND: and } : {}) };
  }

  /**
   * price_asc keeps the Week 1 default (categoryId + minPricePaiseCache
   * composite index, ADR-012) — see this module's product-repository.port.ts
   * doc comment for why a listing sort is fine reading the cache while
   * checkout never is. price_desc/newest each get their own standalone
   * index (same migration as the trigram one, Week 2 Day 1).
   */
  private buildOrderBy(sort: ListProductsFilter["sort"]): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case "price_desc":
        return [{ minPricePaiseCache: "desc" }, { id: "asc" }];
      case "newest":
        return [{ createdAt: "desc" }, { id: "asc" }];
      case "price_asc":
      default:
        return [{ minPricePaiseCache: "asc" }, { id: "asc" }];
    }
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
  ): Promise<
    (ProductVariantEntity & { productId: string; categoryId: string; productName: string; productSlug: string; image: string | null })[]
  > {
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
          select: {
            id: true,
            name: true,
            slug: true,
            categoryId: true,
            images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
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
      categoryId: row.product.categoryId,
      productName: row.product.name,
      productSlug: row.product.slug,
      image: row.product.images[0]?.url ?? null,
    }));
  }

  async findByIds(productIds: string[]): Promise<ProductSummaryWithStatus[]> {
    if (productIds.length === 0) return [];
    const rows = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        categoryId: true,
        isActive: true,
        minPricePaiseCache: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, altText: true, sortOrder: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      categoryId: row.categoryId,
      isActive: row.isActive,
      minPricePaiseCache: row.minPricePaiseCache,
      primaryImage: row.images[0] ?? null,
    }));
  }
}
