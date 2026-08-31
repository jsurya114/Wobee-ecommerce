import type { BannerEntity } from "../../../domain/entities/banner.entity";
import type { BannerRepositoryPort } from "../../ports/banner-repository.port";

export class ListBannersAdminUseCase {
  constructor(private readonly bannerRepository: BannerRepositoryPort) {}

  execute(): Promise<BannerEntity[]> {
    return this.bannerRepository.findAllForAdmin();
  }
}
