import type { BannerRepositoryPort } from "../../ports/banner-repository.port";

export class ReorderBannersUseCase {
  constructor(private readonly bannerRepository: BannerRepositoryPort) {}

  execute(orderedIds: string[]): Promise<void> {
    return this.bannerRepository.reorder(orderedIds);
  }
}
