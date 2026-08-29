import type { MediaEntity } from "../../domain/entities/media.entity";

export interface CreateMediaInput {
  key: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  altText?: string;
  uploadedByUserId: string;
}

/** application depends on this interface, not on Prisma directly (ARCHITECTURE.md §3.1). */
export interface MediaRepositoryPort {
  create(input: CreateMediaInput): Promise<MediaEntity>;
  findById(id: string): Promise<MediaEntity | null>;
  markDeleted(id: string): Promise<MediaEntity>;
}
