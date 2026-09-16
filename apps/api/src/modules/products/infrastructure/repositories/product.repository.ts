import { Prisma, prisma } from "@woobe/database";
import type { PricingMode } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type {
  AdminProductDetailEntity,
  AdminProductImageEntity,
  AdminProductSummaryEntity,
  AdminProductVariantEntity,
  ProductDetailEntity,
  ProductSuggestionEntity,
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
  ProductSummaryProjection,
  ProductSummaryProjectionWithStatus,
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
  fixedPricePaise: true,
  effectivePricePaiseCache: true,
  fabric: true,
  fit: true,
  measurements: true,
  isActive: true,
} as const;

const ADMIN_IMAGE_SELECT = { id: true, url: true, altText: true, sortOrder: true } as const;

/**
 * The lean row/select shared by every listing-style query that returns a
 * `ProductSummaryProjection` (`findMany`'s by-id rehydration, related
 * products, `findByIds`) — pulled out once so the offer-filtering pass's
 * raw-SQL rewrite of `findMany` didn't have to duplicate it a second time.
 */
const SUMMARY_SELECT = {
  id: true,
  slug: true,
  name: true,
  brand: true,
  categoryId: true,
  minPricePaiseCache: true,
  pricingMode: true,
  images: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { url: true, altText: true, sortOrder: true } },
  // Cheapest active variant — its weight + rate override feed the
  // "from 38g · ₹1,180/kg" line every card now shows. The rate is
  // resolved (override ?? admin default) by ListProductsUseCase via
  // the pricing port, not here.
  variants: {
    where: { isActive: true },
    orderBy: { effectivePricePaiseCache: "asc" as const },
    take: 1,
    select: { weightGrams: true, ratePerKgOverridePaise: true },
  },
} satisfies Prisma.ProductSelect;

type SummaryRow = Prisma.ProductGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummaryProjection(row: SummaryRow): ProductSummaryProjection {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    categoryId: row.categoryId,
    minPricePaiseCache: row.minPricePaiseCache,
    primaryImage: row.images[0] ?? null,
    pricingMode: row.pricingMode,
    representativeVariant: row.variants[0]
      ? { weightGrams: row.variants[0].weightGrams, ratePerKgOverridePaise: row.variants[0].ratePerKgOverridePaise }
      : null,
  };
}

/**
 * Offer-filtering pass (2026-09-15) — resolves, per product row, the ONE
 * automatic Offer that would win precedence (if any) and its discount in
 * paise. This mirrors `isOfferActive` + `resolveApplicableOffer` +
 * `calculateOfferDiscount` (apps/api/src/modules/offers/domain) EXACTLY:
 * active + in-schedule (`isActive` AND `startsAt` <= now < `endsAt`), scope
 * specificity PRODUCTS(3) > CATEGORY(2) > ALL_PRODUCTS(1), then `priority`
 * DESC, then the larger discount, then `id` ASC as the final tie-break.
 *
 * ONE BUSINESS DEFINITION, MULTIPLE EFFICIENT QUERY REPRESENTATIONS — this
 * is NOT a second offer engine; it exists only because filtering/sorting a
 * paginated listing by effective price requires resolving the winning
 * offer for every candidate row inside the SAME query (calling the
 * application-layer resolver once per row here would be N+1, and resolving
 * it in Node after fetching would mean sorting/paginating on the wrong
 * value). `resolve-applicable-offer.test.ts` covers the domain function
 * this mirrors; `product.repository.offer-sort.test.ts` covers this SQL
 * fragment directly against a real database so the two can't silently
 * drift apart.
 *
 * Time is evaluated live, on every call, from a `now` passed in by the
 * caller (`new Date()`) — same "no cron job, expire through query logic,
 * live on every read" rule `isOfferActive` itself documents, mirroring that
 * function's own `now: Date` parameter instead of re-deriving time
 * server-side.
 *
 * `startsAt`/`endsAt` are plain `TIMESTAMP(3)` (NO time zone) columns.
 * Prisma's typed client writes/reads them as UTC wall-clock digits
 * consistently, so `offer.endsAt` is correct everywhere else in the app —
 * but any bound parameter here (`${now}`, and Postgres's own `now()`
 * equally) arrives as `timestamptz`, and Postgres compares a naive
 * `timestamp` column against a `timestamptz` value by implicitly casting
 * the NAIVE side through the SESSION time zone, not UTC. On a non-UTC
 * session (this deployment runs `Asia/Kolkata`, +05:30) that silently
 * shifts every comparison by the session's offset — a 5.5h error that made
 * live offers register as already-expired. `AT TIME ZONE 'UTC'` below is
 * what actually fixes it: it tells Postgres those naive digits ARE UTC
 * (matching Prisma's own convention) before comparing, independent of
 * whatever the session's time zone happens to be configured to.
 */
function offerLateralJoin(now: Date): Prisma.Sql {
  return Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT
      o."id" AS offer_id,
      LEAST(
        CASE
          WHEN o."discountType" = 'PERCENTAGE'::"OfferDiscountType" THEN FLOOR(p."minPricePaiseCache" * o."discountValue"::numeric / 100.0)
          ELSE o."discountValue"
        END,
        p."minPricePaiseCache"
      )::int AS discount_paise
    FROM "offers" o
    WHERE o."isActive" = true
      AND (o."startsAt" AT TIME ZONE 'UTC') <= ${now}
      AND (o."endsAt" AT TIME ZONE 'UTC') > ${now}
      AND (
        o."scope" = 'ALL_PRODUCTS'::"OfferScope"
        OR (o."scope" = 'CATEGORY'::"OfferScope" AND o."categoryId" = p."categoryId")
        OR (
          o."scope" = 'PRODUCTS'::"OfferScope"
          AND EXISTS (SELECT 1 FROM "offer_products" op WHERE op."offerId" = o."id" AND op."productId" = p."id")
        )
      )
    ORDER BY
      CASE o."scope" WHEN 'PRODUCTS'::"OfferScope" THEN 3 WHEN 'CATEGORY'::"OfferScope" THEN 2 ELSE 1 END DESC,
      o."priority" DESC,
      LEAST(
        CASE
          WHEN o."discountType" = 'PERCENTAGE'::"OfferDiscountType" THEN FLOOR(p."minPricePaiseCache" * o."discountValue"::numeric / 100.0)
          ELSE o."discountValue"
        END,
        p."minPricePaiseCache"
      ) DESC,
      o."id" ASC
    LIMIT 1
  ) AS winning_offer ON true
`;
}

/**
 * ADR-010: the ONLY file in the products module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class ProductRepository implements ProductRepositoryPort {
  /**
   * Offer-filtering pass (2026-09-15) rewrote this to raw SQL for exactly
   * two things: the `onOffer` filter, and making `price_asc`/`price_desc`
   * sort by the customer's CURRENT EFFECTIVE selling price (base minus the
   * winning automatic Offer's discount — never a coupon, which is
   * checkout/cart-only) instead of the raw `minPricePaiseCache`. Both need
   * the per-row winning-offer resolution (`offerLateralJoin`) evaluated
   * BEFORE `LIMIT`/`OFFSET`, which Prisma's query builder can't express.
   *
   * The raw SQL itself only ever selects `products.id` — two queries (ids
   * page + total count), both filtered/ordered/paginated in Postgres. The
   * actual row data is still fetched through the existing, unchanged
   * `prisma.product.findMany({ where: { id: { in: ids } } })` call and
   * re-ordered in JS to match the id list — this confines the raw-SQL risk
   * to "did we pick the right ids, in the right order," not "did we
   * correctly re-derive every field of the response," and means `newest`
   * sort / no-offer-filter requests still go through the exact same
   * well-tested row shape as before.
   */
  async findMany(filter: ListProductsFilter): Promise<ListProductsResult> {
    const where = buildOfferAwareWhere(filter);
    const orderBy = buildOfferAwareOrderBy(filter.sort);
    // One instant shared by both queries below — so the id page and its
    // count can never disagree about which offers were "live" (see
    // `offerLateralJoin`'s own doc comment for why this is a JS `Date`
    // parameter, never Postgres's own `now()`).
    const offerJoin = offerLateralJoin(new Date());

    const [idRows, countRows] = await Promise.all([
      prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p."id"
        FROM "products" p
        ${offerJoin}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${filter.limit}
        OFFSET ${(filter.page - 1) * filter.limit}
      `),
      // The count never depends on sort, and only needs the offer lateral
      // join when `onOffer`/`offerId` actually filter on it — skipped
      // otherwise so a plain listing/category/search count isn't paying for
      // a per-row offer resolution it doesn't use.
      filter.onOffer || filter.offerId
        ? prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
            SELECT COUNT(*)::bigint AS count
            FROM "products" p
            ${offerJoin}
            WHERE ${where}
          `)
        : prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
            SELECT COUNT(*)::bigint AS count
            FROM "products" p
            WHERE ${where}
          `),
    ]);

    const ids = idRows.map((row) => row.id);
    const total = Number(countRows[0]?.count ?? 0n);
    if (ids.length === 0) return { products: [], total };

    const rows = await prisma.product.findMany({ where: { id: { in: ids } }, select: SUMMARY_SELECT });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    // Re-order to match the SQL-decided (offer-aware, pre-pagination) order
    // — `findMany({ where: { id: { in } } })` makes no ordering guarantee.
    const products = ids.flatMap((id) => {
      const row = rowById.get(id);
      return row ? [toSummaryProjection(row)] : [];
    });

    return { products, total };
  }

  /**
   * See `ProductRepositoryPort.findTopProductsPerOffer`'s own doc comment.
   * Reuses `offerLateralJoin` (the SAME winning-offer resolution `findMany`'s
   * `onOffer`/sort logic uses) and `buildOfferAwareWhere` (with `onOffer:
   * true`, so only products a winning offer actually applies to are
   * considered) — this is not a second offer-eligibility rule, just a
   * different ranking wrapped around the same one. `ROW_NUMBER() OVER
   * (PARTITION BY winning_offer.offer_id ORDER BY effective price ASC, id
   * ASC)` ranks every matching product within its own winning offer's group
   * in one pass; the outer `WHERE rn <= limit` keeps each group capped
   * without ever materializing more than `limit` rows per offer.
   */
  async findTopProductsPerOffer(params: { limit: number; inStockVariantIds?: string[] }): Promise<{ offerId: string; productId: string }[]> {
    const offerJoin = offerLateralJoin(new Date());
    const where = buildOfferAwareWhere({
      onOffer: true,
      inStockVariantIds: params.inStockVariantIds,
      sort: "price_asc",
      page: 1,
      limit: params.limit,
    });

    const rows = await prisma.$queryRaw<{ offer_id: string; product_id: string }[]>(Prisma.sql`
      SELECT offer_id, product_id
      FROM (
        SELECT
          winning_offer.offer_id AS offer_id,
          p."id" AS product_id,
          ROW_NUMBER() OVER (
            PARTITION BY winning_offer.offer_id
            ORDER BY COALESCE(p."minPricePaiseCache" - winning_offer.discount_paise, p."minPricePaiseCache") ASC, p."id" ASC
          ) AS rn
        FROM "products" p
        ${offerJoin}
        WHERE ${where}
      ) ranked
      WHERE rn <= ${params.limit}
      ORDER BY offer_id, rn
    `);

    return rows.map((row) => ({ offerId: row.offer_id, productId: row.product_id }));
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
            fixedPricePaise: true,
            fabric: true,
            fit: true,
            measurements: true,
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
      pricingMode: row.pricingMode,
      images: row.images,
      variants: row.variants,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
    };
  }

  async findRelatedProducts(params: {
    excludeProductId: string;
    categoryId: string;
    limit: number;
  }): Promise<ProductSummaryProjection[]> {
    if (params.limit <= 0) return [];
    const rows = await prisma.product.findMany({
      where: {
        // Same visibility rule as the catalogue listing (buildWhere) — no
        // separate/stricter rule for related products.
        isActive: true,
        id: { not: params.excludeProductId },
        categoryId: params.categoryId,
      },
      // Mirrors findMany's default (price_asc) — deterministic, and reads
      // as "more of this category" rather than "our newest arrivals".
      orderBy: [{ minPricePaiseCache: "asc" }, { id: "asc" }],
      take: params.limit,
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        categoryId: true,
        minPricePaiseCache: true,
        pricingMode: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, altText: true, sortOrder: true } },
        variants: {
          where: { isActive: true },
          orderBy: { effectivePricePaiseCache: "asc" },
          take: 1,
          select: { weightGrams: true, ratePerKgOverridePaise: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      categoryId: row.categoryId,
      minPricePaiseCache: row.minPricePaiseCache,
      primaryImage: row.images[0] ?? null,
      pricingMode: row.pricingMode,
      representativeVariant: row.variants[0]
        ? { weightGrams: row.variants[0].weightGrams, ratePerKgOverridePaise: row.variants[0].ratePerKgOverridePaise }
        : null,
    }));
  }

  async searchSuggestions(query: string, limit: number): Promise<ProductSuggestionEntity[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const rows = await prisma.product.findMany({
      where: { isActive: true, name: { contains: trimmed, mode: "insensitive" } },
      // Cheapest first, `id` tiebreaker — deterministic, same as findMany's price_asc.
      orderBy: [{ minPricePaiseCache: "asc" }, { id: "asc" }],
      take: limit,
      select: {
        id: true,
        slug: true,
        name: true,
        minPricePaiseCache: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, altText: true, sortOrder: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      minPricePaiseCache: row.minPricePaiseCache,
      primaryImage: row.images[0] ?? null,
    }));
  }

  async findVariantsByIds(
    variantIds: string[],
  ): Promise<
    (ProductVariantEntity & {
      productId: string;
      categoryId: string;
      productName: string;
      productSlug: string;
      image: string | null;
      pricingMode: PricingMode;
    })[]
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
        fixedPricePaise: true,
        fabric: true,
        fit: true,
        measurements: true,
        isActive: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            categoryId: true,
            pricingMode: true,
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
      fixedPricePaise: row.fixedPricePaise,
      fabric: row.fabric,
      fit: row.fit,
      measurements: row.measurements,
      isActive: row.isActive,
      productId: row.product.id,
      categoryId: row.product.categoryId,
      pricingMode: row.product.pricingMode,
      productName: row.product.name,
      productSlug: row.product.slug,
      image: row.product.images[0]?.url ?? null,
    }));
  }

  async findByIds(productIds: string[]): Promise<ProductSummaryProjectionWithStatus[]> {
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
        pricingMode: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, altText: true, sortOrder: true } },
        variants: {
          where: { isActive: true },
          orderBy: { effectivePricePaiseCache: "asc" },
          take: 1,
          select: { weightGrams: true, ratePerKgOverridePaise: true },
        },
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
      pricingMode: row.pricingMode,
      representativeVariant: row.variants[0]
        ? { weightGrams: row.variants[0].weightGrams, ratePerKgOverridePaise: row.variants[0].ratePerKgOverridePaise }
        : null,
    }));
  }

  async findProductIdsForVariantIds(variantIds: string[]): Promise<Map<string, string>> {
    if (variantIds.length === 0) return new Map();
    const rows = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true },
    });
    return new Map(rows.map((row) => [row.id, row.productId]));
  }

  async findPrimaryImageUrlByCategoryIds(categoryIds: string[]): Promise<Map<string, string>> {
    if (categoryIds.length === 0) return new Map();
    // One row per category: the cheapest active product that has an image.
    const rows = await prisma.product.findMany({
      where: { categoryId: { in: categoryIds }, isActive: true, images: { some: {} } },
      orderBy: [{ categoryId: "asc" }, { minPricePaiseCache: "asc" }, { id: "asc" }],
      distinct: ["categoryId"],
      select: { categoryId: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
    });
    return new Map(rows.flatMap((row) => (row.images[0] ? [[row.categoryId, row.images[0].url] as [string, string]] : [])));
  }

  async countActiveProductsBySize(sizes: string[]): Promise<Map<string, number>> {
    if (sizes.length === 0) return new Map();
    const rows = await prisma.productVariant.groupBy({
      by: ["size"],
      where: { size: { in: sizes }, isActive: true, product: { isActive: true } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.size, row._count._all]));
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
            pricingMode: input.pricingMode,
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
            pricingMode: input.pricingMode,
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
            // No ratePerKgOverridePaise — omitted so Prisma leaves the
            // column at its DB default (null) for every new variant; the
            // deprecated field is never written by this repository anymore.
            fixedPricePaise: input.fixedPricePaise,
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
            color: input.color,
            size: input.size,
            weightGrams: input.weightGrams,
            // No ratePerKgOverridePaise in the update payload — a legacy
            // value already on this row is left exactly as-is (retained for
            // compatibility, never overwritten and never applied to price).
            fixedPricePaise: input.fixedPricePaise,
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

  async findProductPricingMode(productId: string): Promise<PricingMode | null> {
    const row = await prisma.product.findUnique({
      where: { id: productId },
      select: { pricingMode: true },
    });
    return row?.pricingMode ?? null;
  }

  async findVariantsForPricingModeSwitch(
    productId: string,
  ): Promise<{ id: string; weightGrams: number; fixedPricePaise: number | null; isActive: boolean }[]> {
    return prisma.productVariant.findMany({
      where: { productId },
      select: { id: true, weightGrams: true, fixedPricePaise: true, isActive: true },
    });
  }

  async repriceVariantsForPricingModeSwitch(
    updates: { id: string; fixedPricePaise: number | null; effectivePricePaiseCache: number }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    await prisma.$transaction(
      updates.map((update) =>
        prisma.productVariant.update({
          where: { id: update.id },
          data: { fixedPricePaise: update.fixedPricePaise, effectivePricePaiseCache: update.effectivePricePaiseCache },
        }),
      ),
    );
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

  async slugExists(slug: string, excludeProductId?: string): Promise<boolean> {
    const count = await prisma.product.count({
      where: { slug, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
    });
    return count > 0;
  }

  async skuExists(sku: string): Promise<boolean> {
    const count = await prisma.productVariant.count({ where: { sku } });
    return count > 0;
  }
}

/**
 * Every filter is AND'd together; size/color are each OR'd within
 * themselves (independent facets — see ListProductsUseCase's own comment
 * on why a size + color combo isn't required to be the same variant).
 * `search` is a plain `ILIKE '%term%'` (same case-insensitive `contains`
 * shape the old Prisma `where` used) — Postgres' planner still uses the
 * `products_name_trgm_idx` GIN index (pg_trgm, ADR-012) for it here too.
 * `p` is the alias `findMany`'s raw query binds to `"products"`.
 */
function buildOfferAwareWhere(filter: ListProductsFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`p."isActive" = true`];

  if (filter.categoryId) conditions.push(Prisma.sql`p."categoryId" = ${filter.categoryId}`);
  if (filter.collectionId) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "product_collections" pc WHERE pc."productId" = p."id" AND pc."collectionId" = ${filter.collectionId})`,
    );
  }
  if (filter.search) conditions.push(Prisma.sql`p."name" ILIKE ${`%${filter.search}%`}`);
  if (filter.sizes?.length) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "product_variants" v WHERE v."productId" = p."id" AND v."isActive" = true AND v."size" = ANY(${filter.sizes}::text[]))`,
    );
  }
  if (filter.colors?.length) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "product_variants" v WHERE v."productId" = p."id" AND v."isActive" = true AND v."color" = ANY(${filter.colors}::text[]))`,
    );
  }
  if (filter.inStockVariantIds) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "product_variants" v WHERE v."productId" = p."id" AND v."isActive" = true AND v."id" = ANY(${filter.inStockVariantIds}::text[]))`,
    );
  }
  // Deliberately still against `minPricePaiseCache` (the BASE price cache),
  // not the offer-adjusted effective price — a min/max price filter is a
  // separate, narrower scope decision from sort (see the storefront-offer
  // spec's own price-range vs. price-sort distinction); only sort and
  // `onOffer` need the effective/offer-aware price.
  if (filter.minPricePaise !== undefined) conditions.push(Prisma.sql`p."minPricePaiseCache" >= ${filter.minPricePaise}`);
  if (filter.maxPricePaise !== undefined) conditions.push(Prisma.sql`p."minPricePaiseCache" <= ${filter.maxPricePaise}`);
  // Requires `offerLateralJoin`'s join to already be present in the query this
  // WHERE clause is used in.
  if (filter.onOffer) conditions.push(Prisma.sql`winning_offer.offer_id IS NOT NULL`);
  // Offer merchandising pass (2026-09-15) — pins to ONE specific offer
  // (`/products?offerId=`), rather than "any offer" — see `ListProductsFilter.offerId`'s
  // own doc comment. Composable with `onOffer` (redundant together, harmless).
  if (filter.offerId) conditions.push(Prisma.sql`winning_offer.offer_id = ${filter.offerId}`);

  return Prisma.join(conditions, " AND ");
}

/**
 * `price_asc`/`price_desc` sort by the CUSTOMER'S CURRENT EFFECTIVE selling
 * price — `minPricePaiseCache` minus the winning automatic Offer's discount
 * (0 when `winning_offer` didn't match) — never the raw base price and
 * never a coupon (checkout/cart-only, never PLP; see the module's own
 * `offerLateralJoin` doc comment). `newest` is unaffected by offers and
 * keeps its original index-backed shape. `id` is always the final
 * tiebreaker so pagination stays stable across requests.
 */
function buildOfferAwareOrderBy(sort: ListProductsFilter["sort"]): Prisma.Sql {
  switch (sort) {
    case "price_desc":
      return Prisma.sql`COALESCE(p."minPricePaiseCache" - winning_offer.discount_paise, p."minPricePaiseCache") DESC, p."id" ASC`;
    case "newest":
      return Prisma.sql`p."createdAt" DESC, p."id" ASC`;
    case "price_asc":
    default:
      return Prisma.sql`COALESCE(p."minPricePaiseCache" - winning_offer.discount_paise, p."minPricePaiseCache") ASC, p."id" ASC`;
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
    pricingMode: row.pricingMode,
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
