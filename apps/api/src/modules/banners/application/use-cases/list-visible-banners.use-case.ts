import { parseBannerCta } from "@woobe/validation";
import type { BannerSummaryEntity } from "../../domain/entities/banner.entity";
import { resolveBannerCtaHref } from "../../domain/resolve-banner-cta";
import type { BannerLinkTargetsPort } from "../ports/banner-link-targets.port";
import type { BannerRepositoryPort } from "../ports/banner-repository.port";

/**
 * What the storefront (and `home`'s composed payload) shows — active,
 * in-schedule banners in admin-set order. Exported from banners.module.ts
 * for cross-module use (home composes it into one payload, no extra
 * request — see GetHomePageUseCase).
 *
 * 2026-09-28: each banner also carries `resolvedCtaUrl`, its CTA action
 * resolved to a live storefront path (see resolveBannerCtaHref). Lookups are
 * batched — at most one query per target kind, and only for kinds actually in
 * use — and run on every read, so a renamed slug or deactivated target is
 * reflected immediately (the cached part is only the banner rows themselves).
 */
export class ListVisibleBannersUseCase {
  constructor(
    private readonly bannerRepository: BannerRepositoryPort,
    private readonly linkTargets: BannerLinkTargetsPort,
  ) {}

  async execute(): Promise<BannerSummaryEntity[]> {
    const banners = await this.bannerRepository.findVisible(new Date());
    const actions = banners.map((banner) => parseBannerCta(banner.ctaUrl));

    const productIds = [...new Set(actions.flatMap((a) => (a?.type === "PRODUCT" ? [a.id] : [])))];
    const needs = (type: "CATEGORY" | "COLLECTION") => actions.some((a) => a?.type === type);
    const [categories, collections, products] = await Promise.all([
      needs("CATEGORY") ? this.linkTargets.categorySlugs() : Promise.resolve(new Map<string, string>()),
      needs("COLLECTION") ? this.linkTargets.collectionSlugs() : Promise.resolve(new Map<string, string>()),
      productIds.length > 0 ? this.linkTargets.productSlugs(productIds) : Promise.resolve(new Map<string, string>()),
    ]);

    return banners.map((banner, i) => ({
      ...banner,
      resolvedCtaUrl: resolveBannerCtaHref(actions[i] ?? null, { categories, collections, products }),
    }));
  }
}
