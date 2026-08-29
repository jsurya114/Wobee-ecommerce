import { prisma } from "@woobe/database";
import type { CreateMediaInput, MediaRepositoryPort } from "../../application/ports/media-repository.port";
import type { MediaEntity } from "../../domain/entities/media.entity";

const SELECT_FIELDS = {
  id: true,
  type: true,
  key: true,
  url: true,
  mimeType: true,
  sizeBytes: true,
  altText: true,
  status: true,
  uploadedByUserId: true,
  createdAt: true,
} as const;

/**
 * ADR-010: the ONLY file in the media module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class MediaRepository implements MediaRepositoryPort {
  async create(input: CreateMediaInput): Promise<MediaEntity> {
    return prisma.media.create({
      data: {
        type: "IMAGE",
        key: input.key,
        url: input.url,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        altText: input.altText ?? null,
        uploadedByUserId: input.uploadedByUserId,
      },
      select: SELECT_FIELDS,
    });
  }

  async findById(id: string): Promise<MediaEntity | null> {
    return prisma.media.findUnique({ where: { id }, select: SELECT_FIELDS });
  }

  async markDeleted(id: string): Promise<MediaEntity> {
    return prisma.media.update({ where: { id }, data: { status: "DELETED" }, select: SELECT_FIELDS });
  }
}
