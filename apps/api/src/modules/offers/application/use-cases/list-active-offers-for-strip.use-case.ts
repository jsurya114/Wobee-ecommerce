import type { OfferStripEntity } from "../../domain/entities/offer.entity";
import type { OfferRepositoryPort } from "../ports/offer-repository.port";

/**
 * The homepage promotional offer strip's data source — every currently
 * active, in-schedule offer, admin-controlled, never hardcoded copy.
 * Mirrors `ListVisibleBannersUseCase` (banners module) exactly: the query
 * itself does the `isActive`/schedule filtering (repository-level, backed
 * by `isOfferActive`'s own logic), so a scheduled-but-not-yet-started or
 * already-expired offer is simply absent from the result — no cron job
 * needed to keep this fresh, it's correct on every call by construction.
 * Exported from offers.module.ts for `home`'s composed homepage payload.
 */
export class ListActiveOffersForStripUseCase {
  constructor(private readonly offerRepository: OfferRepositoryPort) {}

  execute(): Promise<OfferStripEntity[]> {
    return this.offerRepository.findActiveForStrip(new Date());
  }
}
