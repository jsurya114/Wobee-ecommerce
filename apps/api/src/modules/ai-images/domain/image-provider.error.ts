/** Thrown by an ImageGenerationProviderPort. `retryable: false` means retrying can never help (bad key, moderation, bad input). */
export class ImageProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code: string = "PROVIDER_ERROR",
  ) {
    super(message);
    this.name = "ImageProviderError";
  }
}
