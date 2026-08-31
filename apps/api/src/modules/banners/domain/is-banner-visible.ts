export interface BannerScheduleInput {
  isActive: boolean;
  startAt: Date | null;
  endAt: Date | null;
}

/**
 * Pure domain function — no I/O (ARCHITECTURE.md §3.1). A banner is visible
 * to customers when it's active AND (if scheduled) `now` falls within
 * [startAt, endAt] — either bound is optional. The repository's own query
 * implements the equivalent condition at the DB level (so pagination/limits
 * stay server-side); this function is what that query's correctness is
 * unit-tested against.
 */
export function isBannerVisible(banner: BannerScheduleInput, now: Date): boolean {
  if (!banner.isActive) return false;
  if (banner.startAt && now < banner.startAt) return false;
  if (banner.endAt && now > banner.endAt) return false;
  return true;
}
