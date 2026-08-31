import type { UpdateBannerInput as UpdateBannerRequest } from "@woobe/validation";
import type { BannerEntity } from "../../../domain/entities/banner.entity";
import type { BannerRepositoryPort } from "../../ports/banner-repository.port";

export class UpdateBannerUseCase {
  constructor(private readonly bannerRepository: BannerRepositoryPort) {}

  execute(id: string, input: UpdateBannerRequest): Promise<BannerEntity> {
    return this.bannerRepository.update(id, input);
  }
}
