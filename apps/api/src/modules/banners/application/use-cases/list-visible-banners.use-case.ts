import type { BannerSummaryEntity } from "../../domain/entities/banner.entity";
import type { BannerRepositoryPort } from "../ports/banner-repository.port";

/**
 * What the storefront (and `home`'s composed payload) shows — active,
 * in-schedule banners in admin-set order. Exported from banners.module.ts
 * for cross-module use (home composes it into one payload, no extra
 * request — see GetHomePageUseCase).
 */
export class ListVisibleBannersUseCase {
  constructor(private readonly bannerRepository: BannerRepositoryPort) {}

  execute(): Promise<BannerSummaryEntity[]> {
    return this.bannerRepository.findVisible(new Date());
  }
}
