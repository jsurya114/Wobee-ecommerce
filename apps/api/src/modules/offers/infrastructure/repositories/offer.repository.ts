import { Prisma, prisma } from "@woobe/database";
import { NotFoundError } from "../../../../shared/errors";
import type { OfferEntity, OfferForResolution, OfferStripEntity } from "../../domain/entities/offer.entity";
import type { CreateOfferData, OfferRepositoryPort, UpdateOfferData } from "../../application/ports/offer-repository.port";

const RESOLUTION_SELECT = {
  id: true,
  name: true,
  discountType: true,
  discountValue: true,
  scope: true,
  categoryId: true,
  priority: true,
  products: { select: { productId: true } },
} as const;

const ADMIN_SELECT = {
  id: true,
  name: true,
  description: true,
  discountType: true,
  discountValue: true,
  scope: true,
  categoryId: true,
  priority: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  products: { select: { productId: true } },
} as const;

type ResolutionRow = Prisma.OfferGetPayload<{ select: typeof RESOLUTION_SELECT }>;
type AdminRow = Prisma.OfferGetPayload<{ select: typeof ADMIN_SELECT }>;

function activeWhere(now: Date): Prisma.OfferWhereInput {
  return { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } };
}

function toResolutionEntity(row: ResolutionRow): OfferForResolution {
  return {
    id: row.id,
    name: row.name,
    discountType: row.discountType,
    discountValue: row.discountValue,
    scope: row.scope,
    categoryId: row.categoryId,
    productIds: row.products.map((p) => p.productId),
    priority: row.priority,
  };
}

function toAdminEntity(row: AdminRow): OfferEntity {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    discountType: row.discountType,
    discountValue: row.discountValue,
    scope: row.scope,
    categoryId: row.categoryId,
    productIds: row.products.map((p) => p.productId),
    priority: row.priority,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * ADR-010: the ONLY file in the offers module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class OfferRepository implements OfferRepositoryPort {
  async findActiveForResolution(now: Date): Promise<OfferForResolution[]> {
    const rows = await prisma.offer.findMany({ where: activeWhere(now), select: RESOLUTION_SELECT });
    return rows.map(toResolutionEntity);
  }

  async findActiveForStrip(now: Date): Promise<OfferStripEntity[]> {
    const rows = await prisma.offer.findMany({
      where: activeWhere(now),
      // Highest-priority/newest first — a reasonable, deterministic default
      // display order for the strip; admin can still use `priority` to
      // control it explicitly.
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, discountType: true, discountValue: true, scope: true },
    });
    return rows;
  }

  async findAllForAdmin(): Promise<OfferEntity[]> {
    const rows = await prisma.offer.findMany({ orderBy: { createdAt: "desc" }, select: ADMIN_SELECT });
    return rows.map(toAdminEntity);
  }

  async findByIdForAdmin(id: string): Promise<OfferEntity | null> {
    const row = await prisma.offer.findUnique({ where: { id }, select: ADMIN_SELECT });
    return row ? toAdminEntity(row) : null;
  }

  async createOffer(data: CreateOfferData): Promise<OfferEntity> {
    const created = await prisma.offer.create({
      data: {
        name: data.name,
        description: data.description,
        discountType: data.discountType,
        discountValue: data.discountValue,
        scope: data.scope,
        categoryId: data.categoryId,
        priority: data.priority,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        products: { create: data.productIds.map((productId) => ({ productId })) },
      },
      select: ADMIN_SELECT,
    });
    return toAdminEntity(created);
  }

  async updateOffer(id: string, data: UpdateOfferData): Promise<OfferEntity> {
    try {
      // Replacing the whole PRODUCTS-scope target set (when productIds is
      // part of this patch) needs its own delete-then-recreate step —
      // Prisma's nested `update` has no "replace this to-many relation"
      // shorthand for a composite-key join table. Same transaction as the
      // scalar update so a failure never leaves the two half-changed.
      const updated = await prisma.$transaction(async (tx) => {
        if (data.productIds !== undefined) {
          await tx.offerProduct.deleteMany({ where: { offerId: id } });
        }
        return tx.offer.update({
          where: { id },
          data: {
            name: data.name,
            description: data.description,
            discountType: data.discountType,
            discountValue: data.discountValue,
            scope: data.scope,
            categoryId: data.categoryId,
            priority: data.priority,
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            ...(data.productIds !== undefined
              ? { products: { create: data.productIds.map((productId) => ({ productId })) } }
              : {}),
          },
          select: ADMIN_SELECT,
        });
      });
      return toAdminEntity(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Offer not found");
      }
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<OfferEntity> {
    try {
      const updated = await prisma.offer.update({ where: { id }, data: { isActive }, select: ADMIN_SELECT });
      return toAdminEntity(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Offer not found");
      }
      throw error;
    }
  }
}
