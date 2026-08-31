import type { BannerRepositoryPort } from "../../ports/banner-repository.port";

export class DeleteBannerUseCase {
  constructor(private readonly bannerRepository: BannerRepositoryPort) {}

  execute(id: string): Promise<void> {
    return this.bannerRepository.delete(id);
  }
}
