import type { CreateBannerInput as CreateBannerRequest } from "@woobe/validation";
import type { BannerEntity } from "../../../domain/entities/banner.entity";
import type { BannerRepositoryPort } from "../../ports/banner-repository.port";

export class CreateBannerUseCase {
  constructor(private readonly bannerRepository: BannerRepositoryPort) {}

  execute(input: CreateBannerRequest): Promise<BannerEntity> {
    return this.bannerRepository.create(input);
  }
}
