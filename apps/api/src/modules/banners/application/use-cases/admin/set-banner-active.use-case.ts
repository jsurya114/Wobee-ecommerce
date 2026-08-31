import type { BannerEntity } from "../../../domain/entities/banner.entity";
import type { BannerRepositoryPort } from "../../ports/banner-repository.port";

export class SetBannerActiveUseCase {
  constructor(private readonly bannerRepository: BannerRepositoryPort) {}

  execute(id: string, isActive: boolean): Promise<BannerEntity> {
    return this.bannerRepository.setActive(id, isActive);
  }
}
