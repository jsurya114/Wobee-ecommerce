import { NotFoundError } from "../../../../shared/errors";
import type { MediaEntity } from "../../domain/entities/media.entity";
import type { MediaRepositoryPort } from "../ports/media-repository.port";

export class GetMediaUseCase {
  constructor(private readonly mediaRepository: MediaRepositoryPort) {}

  async execute(id: string): Promise<MediaEntity> {
    const media = await this.mediaRepository.findById(id);
    if (!media) {
      throw new NotFoundError("Media not found");
    }
    return media;
  }
}
