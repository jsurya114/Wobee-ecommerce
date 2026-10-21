import type { AiImageAngle } from "../../domain/ai-image";

export interface GenerateImageInput {
  /** The garment photo bytes (never a URL — works for localhost dev storage too). */
  sourceImage: Buffer;
  sourceMimeType: string;
  angle: AiImageAngle;
  prompt: string;
}

export interface GeneratedImageResult {
  image: Buffer;
  mimeType: string;
  predictionId?: string;
  creditsUsed?: number;
}

/** Provider-independent: FASHN today, any other vendor (e.g. a Gemini image adapter) later, without touching use-cases. */
export interface ImageGenerationProviderPort {
  readonly name: string;
  /** Throws ImageProviderError. */
  generate(input: GenerateImageInput): Promise<GeneratedImageResult>;
}
