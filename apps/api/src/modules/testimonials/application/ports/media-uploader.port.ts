export interface ImageUploadCommand {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadedImage {
  id: string;
  url: string;
}

/**
 * Adapter onto `media`'s existing UploadMediaUseCase/MediaStoragePort — the
 * same S3-ready storage abstraction admin product photos already use, not
 * a second upload system. `media`'s own HTTP route stays admin-only
 * (customer testimonial photos never touch it); this port is what lets a
 * customer's own upload land in the exact same storage backend under a
 * different authorization path (testimonials.module.ts wires this
 * directly to `media`'s exported use-case).
 */
export interface MediaUploaderPort {
  upload(command: ImageUploadCommand, uploadedByUserId: string): Promise<UploadedImage>;
}
