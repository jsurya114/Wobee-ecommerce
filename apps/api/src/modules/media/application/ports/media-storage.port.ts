/**
 * Provider-independent storage abstraction (week2 (1).md §13's own
 * architecture diagram: `Application -> MediaStorage interface ->
 * S3/Cloudinary implementation`). `LocalDiskMediaStorage` is the only
 * implementation this week (see its own doc comment for why); swapping in
 * a real S3/Cloudinary adapter later means writing one more class against
 * this same interface, touching nothing in `application` or `interface`.
 */
export interface SavedMedia {
  /** Storage-layer key — a local disk path today, an S3 object key tomorrow. Never exposed to a client directly. */
  key: string;
  /** A URL a browser can load directly. */
  url: string;
}

export interface MediaStoragePort {
  save(buffer: Buffer, originalFilename: string, mimeType: string): Promise<SavedMedia>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
