export interface OfferScheduleInput {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Pure domain function — no I/O (ARCHITECTURE.md §3.1). Mirrors
 * `isBannerVisible` (banners module) exactly: an offer is applicable only
 * when it's active AND `now` falls within `[startsAt, endsAt)` — end
 * EXCLUSIVE, per the business rule ("endsAt > current time" in the spec) so
 * an offer disappears the instant its window closes, not one tick after.
 * There is deliberately no cron job that flips `isActive` when `endsAt`
 * passes — expiry is a property of THIS function evaluated live on every
 * read, same "no scheduled job just to expire something" rule Banner
 * already established.
 */
export function isOfferActive(offer: OfferScheduleInput, now: Date): boolean {
  if (!offer.isActive) return false;
  if (now < offer.startsAt) return false;
  if (now >= offer.endsAt) return false;
  return true;
}
