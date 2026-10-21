export interface SourceMedia {
  id: string;
  url: string;
  mimeType: string;
}

/** Adapter over the media module's exported use-cases plus an HTTP fetch of the stored bytes. */
export interface MediaGatewayPort {
  /** Throws NotFoundError when missing or deleted. */
  getActiveImage(mediaId: string): Promise<SourceMedia>;
  download(url: string): Promise<Buffer>;
  store(input: { buffer: Buffer; mimeType: string; filename: string; altText: string; uploadedByUserId: string }): Promise<{ id: string; url: string }>;
  discard(mediaId: string): Promise<void>;
}
