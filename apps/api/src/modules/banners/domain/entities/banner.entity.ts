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
  ctaUrl: string | null;
}
