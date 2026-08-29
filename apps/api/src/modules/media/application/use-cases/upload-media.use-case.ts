import { ValidationError } from "../../../../shared/errors";
import { validateUpload } from "../../domain/validate-upload";
import type { MediaEntity } from "../../domain/entities/media.entity";
import type { MediaRepositoryPort } from "../ports/media-repository.port";
import type { MediaStoragePort } from "../ports/media-storage.port";

export interface UploadMediaCommand {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  altText?: string;
  uploadedByUserId: string;
}

export class UploadMediaUseCase {
  constructor(
    private readonly mediaStorage: MediaStoragePort,
    private readonly mediaRepository: MediaRepositoryPort,
  ) {}

  async execute(command: UploadMediaCommand): Promise<MediaEntity> {
    const validation = validateUpload(command.mimeType, command.sizeBytes);
    if (!validation.ok) {
      throw new ValidationError(validation.error!);
    }

    const saved = await this.mediaStorage.save(command.buffer, command.originalFilename, command.mimeType);

    try {
      return await this.mediaRepository.create({
        key: saved.key,
        url: saved.url,
        mimeType: command.mimeType,
        sizeBytes: command.sizeBytes,
        altText: command.altText,
        uploadedByUserId: command.uploadedByUserId,
      });
    } catch (error) {
      // The file is already written to storage by this point — if the DB
      // insert fails (astronomically unlikely: a key collision, or a
      // dropped connection), clean it up rather than leaking an orphaned
      // file nothing will ever reference or be able to delete through this
      // API. Best-effort: if the cleanup itself fails, the original error
      // is still what the caller sees.
      await this.mediaStorage.delete(saved.key).catch(() => undefined);
      throw error;
    }
  }
}
