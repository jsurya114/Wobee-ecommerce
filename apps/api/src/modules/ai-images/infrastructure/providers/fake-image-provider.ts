import type { GenerateImageInput, GeneratedImageResult, ImageGenerationProviderPort } from "../../application/ports/image-generation-provider.port";

/** Dev/test only (rejected in production by env.ts): echoes the source photo back so the whole flow runs with no vendor or cost. */
export class FakeImageProvider implements ImageGenerationProviderPort {
  readonly name = "fake";

  async generate(input: GenerateImageInput): Promise<GeneratedImageResult> {
    return { image: input.sourceImage, mimeType: input.sourceMimeType, predictionId: `fake-${input.angle.toLowerCase()}`, creditsUsed: 0 };
  }
}
