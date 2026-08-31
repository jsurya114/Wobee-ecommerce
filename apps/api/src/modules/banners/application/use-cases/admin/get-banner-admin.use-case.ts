import { NotFoundError } from "../../../../../shared/errors";
import type { BannerEntity } from "../../../domain/entities/banner.entity";
import type { BannerRepositoryPort } from "../../ports/banner-repository.port";

export class GetBannerAdminUseCase {
  constructor(private readonly bannerRepository: BannerRepositoryPort) {}

  async execute(id: string): Promise<BannerEntity> {
    const banner = await this.bannerRepository.findByIdForAdmin(id);
    if (!banner) {
      throw new NotFoundError("Banner not found");
    }
    return banner;
  }
}
