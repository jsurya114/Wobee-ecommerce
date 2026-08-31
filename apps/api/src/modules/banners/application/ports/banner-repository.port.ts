import type { BannerEntity, BannerSummaryEntity } from "../../domain/entities/banner.entity";

export interface CreateBannerInput {
  imageUrl: string;
  title?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}

export interface UpdateBannerInput {
  imageUrl?: string;
  title?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface BannerRepositoryPort {
  /** Active, in-schedule (see isBannerVisible.ts), ordered by sortOrder — what the storefront shows. */
  findVisible(now: Date): Promise<BannerSummaryEntity[]>;

  findAllForAdmin(): Promise<BannerEntity[]>;
  findByIdForAdmin(id: string): Promise<BannerEntity | null>;
  create(input: CreateBannerInput): Promise<BannerEntity>;
  update(id: string, input: UpdateBannerInput): Promise<BannerEntity>;
  setActive(id: string, isActive: boolean): Promise<BannerEntity>;
  delete(id: string): Promise<void>;
  /** Full ordered id list — reorder writes sortOrder = array index for every id in one pass. */
  reorder(orderedIds: string[]): Promise<void>;
}
