import { Prisma, prisma } from "@woobe/database";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type {
  AdminProductDetailEntity,
  AdminProductImageEntity,
  AdminProductSummaryEntity,
  AdminProductVariantEntity,
  ProductDetailEntity,
  ProductSummaryEntity,
  ProductVariantEntity,
} from "../../domain/entities/product.entity";
import type {
  AddProductImageInput,
  CreateProductInput,
  CreateVariantInput,
  ListProductsAdminFilter,
  ListProductsAdminResult,
  ListProductsFilter,
  ListProductsResult,
  ProductRepositoryPort,
  ProductSummaryWithStatus,
  UpdateProductInput,
  UpdateVariantInput,
} from "../../application/ports/product-repository.port";

const ADMIN_VARIANT_SELECT = {
  id: true,
  sku: true,
  color: true,
  size: true,
  weightGrams: true,
  ratePerKgOverridePaise: true,
  effectivePricePaiseCache: true,
  fabric: true,
  fit: true,
  measurements: true,
  isActive: true,
} as const;

const ADMIN_IMAGE_SELECT = { id: true, url: true, altText: true, sortOrder: true } as const;

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

  // ── Week 2 Day 7 admin surface (week2 (1).md §16) ──

  async findAllForAdmin(filter: ListProductsAdminFilter): Promise<ListProductsAdminResult> {
    const where: Prisma.ProductWhereInput = {
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(filter.search ? { name: { contains: filter.search, mode: "insensitive" } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          categoryId: true,
          isActive: true,
          minPricePaiseCache: true,
          category: { select: { name: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          _count: { select: { variants: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const items: AdminProductSummaryEntity[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      isActive: row.isActive,
      minPricePaiseCache: row.minPricePaiseCache,
      variantCount: row._count.variants,
      primaryImageUrl: row.images[0]?.url ?? null,
    }));

    return { items, total };
  }

  async findByIdForAdmin(productId: string): Promise<AdminProductDetailEntity | null> {
    const row = await prisma.product.findUnique({ where: { id: productId }, include: ADMIN_DETAIL_INCLUDE });
    return row ? toAdminDetail(row) : null;
  }

  async createProduct(input: CreateProductInput): Promise<AdminProductDetailEntity> {
    const created = await withNotFound(
      () =>
        prisma.product.create({
          data: {
            name: input.name,
            slug: input.slug,
            description: input.description,
            brand: input.brand,
            categoryId: input.categoryId,
            metaTitle: input.metaTitle,
            metaDescription: input.metaDescription,
          },
          include: ADMIN_DETAIL_INCLUDE,
        }),
      "Category not found",
      "P2003",
    );
    return toAdminDetail(created);
  }

  async updateProduct(productId: string, input: UpdateProductInput): Promise<AdminProductDetailEntity> {
    const updated = await withNotFound(
      () =>
        prisma.product.update({
          where: { id: productId },
          data: {
            name: input.name,
            slug: input.slug,
            description: input.description,
            brand: input.brand,
            categoryId: input.categoryId,
            metaTitle: input.metaTitle,
            metaDescription: input.metaDescription,
          },
          include: ADMIN_DETAIL_INCLUDE,
        }),
      "Product not found",
    );
    return toAdminDetail(updated);
  }

  async setProductActive(productId: string, isActive: boolean): Promise<AdminProductDetailEntity> {
    const updated = await withNotFound(
      () => prisma.product.update({ where: { id: productId }, data: { isActive }, include: ADMIN_DETAIL_INCLUDE }),
      "Product not found",
    );
    return toAdminDetail(updated);
  }

  async createVariant(input: CreateVariantInput): Promise<AdminProductVariantEntity> {
    const created = await withNotFound(
      () =>
        prisma.productVariant.create({
          data: {
            productId: input.productId,
            sku: input.sku,
            color: input.color,
            size: input.size,
            weightGrams: input.weightGrams,
            ratePerKgOverridePaise: input.ratePerKgOverridePaise,
            fabric: input.fabric,
            fit: input.fit,
            measurements: input.measurements,
            effectivePricePaiseCache: input.effectivePricePaiseCache,
          },
          select: ADMIN_VARIANT_SELECT,
        }),
      "Product not found",
      "P2003", // FK violation on productId — same TOCTOU-safe pattern collections' assignProduct uses
    );
    return created;
  }

  async updateVariant(variantId: string, input: UpdateVariantInput): Promise<AdminProductVariantEntity> {
    return withNotFound(
      () =>
        prisma.productVariant.update({
          where: { id: variantId },
          data: {
            sku: input.sku,
            color: input.color,
            size: input.size,
            weightGrams: input.weightGrams,
            ratePerKgOverridePaise: input.ratePerKgOverridePaise,
            fabric: input.fabric,
            fit: input.fit,
            measurements: input.measurements,
            effectivePricePaiseCache: input.effectivePricePaiseCache,
          },
          select: ADMIN_VARIANT_SELECT,
        }),
      "Variant not found",
    );
  }

  async setVariantActive(variantId: string, isActive: boolean): Promise<AdminProductVariantEntity> {
    return withNotFound(
      () => prisma.productVariant.update({ where: { id: variantId }, data: { isActive }, select: ADMIN_VARIANT_SELECT }),
      "Variant not found",
    );
  }

  async findVariantProductId(variantId: string): Promise<string | null> {
    const row = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { productId: true } });
    return row?.productId ?? null;
  }

  async findVariantForAdmin(variantId: string): Promise<(AdminProductVariantEntity & { productId: string }) | null> {
    const row = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { ...ADMIN_VARIANT_SELECT, productId: true },
    });
    return row;
  }

  async recomputeMinPrice(productId: string): Promise<void> {
    const result = await prisma.productVariant.aggregate({
      where: { productId, isActive: true },
      _min: { effectivePricePaiseCache: true },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { minPricePaiseCache: result._min.effectivePricePaiseCache ?? 0 },
    });
  }

  async addImage(productId: string, input: AddProductImageInput): Promise<AdminProductImageEntity> {
    const count = await prisma.productImage.count({ where: { productId } });
    return withNotFound(
      () =>
        prisma.productImage.create({
          data: { productId, url: input.url, altText: input.altText, sortOrder: count },
          select: ADMIN_IMAGE_SELECT,
        }),
      "Product not found",
      "P2003",
    );
  }

  async removeImage(productId: string, imageId: string): Promise<void> {
    // deleteMany, not delete — removing an image that isn't this product's
    // (or doesn't exist) is a no-op, not a 500; the use-case's own
    // findByIdForAdmin call is what surfaces a real 404 for an unknown product.
    await prisma.productImage.deleteMany({ where: { id: imageId, productId } });
  }

  async listImageIds(productId: string): Promise<string[]> {
    const rows = await prisma.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async reorderImages(productId: string, orderedImageIds: string[]): Promise<void> {
    await prisma.$transaction(
      orderedImageIds.map((imageId, index) =>
        prisma.productImage.update({ where: { id: imageId, productId }, data: { sortOrder: index } }),
      ),
    );
  }
}

const ADMIN_DETAIL_INCLUDE = {
  images: { orderBy: { sortOrder: "asc" as const }, select: ADMIN_IMAGE_SELECT },
  variants: { orderBy: { createdAt: "asc" as const }, select: ADMIN_VARIANT_SELECT },
} satisfies Prisma.ProductInclude;

type AdminProductRow = Prisma.ProductGetPayload<{ include: typeof ADMIN_DETAIL_INCLUDE }>;

function toAdminDetail(row: AdminProductRow): AdminProductDetailEntity {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    brand: row.brand,
    categoryId: row.categoryId,
    isActive: row.isActive,
    minPricePaiseCache: row.minPricePaiseCache,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    images: row.images,
    variants: row.variants,
  };
}

/**
 * Maps Prisma's "row not found" (P2025) — and, when `fkErrorCode` is given,
 * an FK violation (P2003, e.g. an unknown productId on variant/image
 * creation) — to NotFoundError, same TOCTOU-safe pattern collections' own
 * repository already established. Also maps a unique-constraint violation
 * (P2002 — a duplicate slug or SKU) to ConflictError, matching
 * CollectionRepository.create/update's own handling of the same case for
 * Collection.slug.
 */
async function withNotFound<T>(operation: () => Promise<T>, message: string, fkErrorCode?: "P2003"): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025" || (fkErrorCode && error.code === fkErrorCode)) {
        throw new NotFoundError(message);
      }
      if (error.code === "P2002") {
        const target = (error.meta?.target as string[] | undefined)?.join(", ") ?? "field";
        throw new ConflictError(`A record with this ${target} already exists`);
      }
    }
    throw error;
  }
}
