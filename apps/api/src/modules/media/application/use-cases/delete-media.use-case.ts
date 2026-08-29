import { NotFoundError } from "../../../../shared/errors";
import type { MediaRepositoryPort } from "../ports/media-repository.port";
import type { MediaStoragePort } from "../ports/media-storage.port";

/** Soft-deletes the row (status: DELETED, week2 (1).md §13's "Media status") and removes the actual bytes from storage — a deleted upload's row stays for audit, but its file and URL stop resolving. */
export class DeleteMediaUseCase {
  constructor(
    private readonly mediaStorage: MediaStoragePort,
    private readonly mediaRepository: MediaRepositoryPort,
  ) {}

  async execute(id: string): Promise<void> {
    const media = await this.mediaRepository.findById(id);
    if (!media || media.status === "DELETED") {
      throw new NotFoundError("Media not found");
    }
    await this.mediaRepository.markDeleted(id);
    await this.mediaStorage.delete(media.key);
  }
}
