import { Prisma, prisma } from "@woobe/database";
import { NotFoundError } from "../../../../shared/errors";
import type { BannerEntity, BannerSummaryEntity } from "../../domain/entities/banner.entity";
import type {
  BannerRepositoryPort,
  CreateBannerInput,
  UpdateBannerInput,
} from "../../application/ports/banner-repository.port";

const ADMIN_SELECT = {
  id: true,
  imageUrl: true,
  title: true,
  subtitle: true,
  ctaLabel: true,
  ctaUrl: true,
  isActive: true,
  sortOrder: true,
  startAt: true,
  endAt: true,
} as const;

type AdminRow = Prisma.BannerGetPayload<{ select: typeof ADMIN_SELECT }>;

function toEntity(row: AdminRow): BannerEntity {
  return {
    ...row,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
  };
}

/**
 * ADR-010: the ONLY file in the banners module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class BannerRepository implements BannerRepositoryPort {
  async findVisible(now: Date): Promise<BannerSummaryEntity[]> {
    const rows = await prisma.banner.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, imageUrl: true, title: true, subtitle: true, ctaLabel: true, ctaUrl: true },
    });
    return rows;
  }

  async findAllForAdmin(): Promise<BannerEntity[]> {
    const rows = await prisma.banner.findMany({ orderBy: { sortOrder: "asc" }, select: ADMIN_SELECT });
    return rows.map(toEntity);
  }

  async findByIdForAdmin(id: string): Promise<BannerEntity | null> {
    const row = await prisma.banner.findUnique({ where: { id }, select: ADMIN_SELECT });
    return row ? toEntity(row) : null;
  }

  async create(input: CreateBannerInput): Promise<BannerEntity> {
    const count = await prisma.banner.count();
    const row = await prisma.banner.create({
      data: {
        imageUrl: input.imageUrl,
        title: input.title ?? null,
        subtitle: input.subtitle ?? null,
        ctaLabel: input.ctaLabel ?? null,
        ctaUrl: input.ctaUrl ?? null,
        startAt: input.startAt ? new Date(input.startAt) : null,
        endAt: input.endAt ? new Date(input.endAt) : null,
        sortOrder: count,
      },
      select: ADMIN_SELECT,
    });
    return toEntity(row);
  }

  async update(id: string, input: UpdateBannerInput): Promise<BannerEntity> {
    try {
      const row = await prisma.banner.update({
        where: { id },
        data: {
          imageUrl: input.imageUrl,
          title: input.title,
          subtitle: input.subtitle,
          ctaLabel: input.ctaLabel,
          ctaUrl: input.ctaUrl,
          ...(input.startAt !== undefined ? { startAt: input.startAt ? new Date(input.startAt) : null } : {}),
          ...(input.endAt !== undefined ? { endAt: input.endAt ? new Date(input.endAt) : null } : {}),
        },
        select: ADMIN_SELECT,
      });
      return toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Banner not found");
      }
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<BannerEntity> {
    try {
      const row = await prisma.banner.update({ where: { id }, data: { isActive }, select: ADMIN_SELECT });
      return toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Banner not found");
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    // deleteMany, not delete — deleting an already-gone banner is a no-op,
    // not a 500 (same TOCTOU-safe pattern this codebase's other repositories use).
    await prisma.banner.deleteMany({ where: { id } });
  }

  async reorder(orderedIds: string[]): Promise<void> {
    await prisma.$transaction(orderedIds.map((id, index) => prisma.banner.update({ where: { id }, data: { sortOrder: index } })));
  }
}
