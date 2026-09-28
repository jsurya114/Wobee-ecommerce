export interface BannerEntity {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  startAt: string | null;
  endAt: string | null;
}

/** Customer-facing shape — no `isActive`/schedule fields (the query already filtered by them). */
export interface BannerSummaryEntity {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  /** The stored action reference (e.g. "category:<id>"), kept for backwards compatibility — link to `resolvedCtaUrl`, not this. */
  ctaUrl: string | null;
  /** 2026-09-28 — the CTA resolved to a live storefront path (null = no link / target gone). */
  resolvedCtaUrl: string | null;
}

/** A banner row as stored — the repository never resolves links. */
export type StoredBannerSummary = Omit<BannerSummaryEntity, "resolvedCtaUrl">;
