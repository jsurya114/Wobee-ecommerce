import { ImageProviderError } from "../../domain/image-provider.error";
import type { GenerateImageInput, GeneratedImageResult, ImageGenerationProviderPort } from "../../application/ports/image-generation-provider.port";

const BASE_URL = "https://api.fashn.ai/v1";

export interface FashnConfig {
  apiKey: string;
  mode: "fast" | "balanced" | "quality";
  resolution: "1k" | "2k";
  pollIntervalMs?: number;
  maxWaitMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** FASHN runtime errors that retrying can never fix. */
const PERMANENT_RUNTIME_ERRORS = new Set(["ContentModerationError", "ImageLoadError", "InputValidationError"]);

/**
 * FASHN `product-to-model` (docs.fashn.ai). One call per angle with
 * num_images=1 so each angle retries/regenerates independently. The source
 * is sent as base64 so it works with local-disk dev storage too. Output URLs
 * on FASHN's CDN expire after ~72h, so the bytes are downloaded here and the
 * caller re-hosts them — a FASHN URL is never persisted.
 */
export class FashnImageProvider implements ImageGenerationProviderPort {
  readonly name = "fashn";
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;

  constructor(private readonly config: FashnConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.pollIntervalMs = config.pollIntervalMs ?? 3000;
    this.maxWaitMs = config.maxWaitMs ?? 4 * 60 * 1000;
  }

  async generate(input: GenerateImageInput): Promise<GeneratedImageResult> {
    const predictionId = await this.submit(input);
    const { outputUrl, creditsUsed } = await this.waitForResult(predictionId);
    const { image, mimeType } = await this.download(outputUrl);
    return { image, mimeType, predictionId, creditsUsed };
  }

  private async submit(input: GenerateImageInput): Promise<string> {
    const response = await this.request(`${BASE_URL}/run`, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model_name: "product-to-model",
        inputs: {
          product_image: `data:${input.sourceMimeType};base64,${input.sourceImage.toString("base64")}`,
          prompt: input.prompt,
          resolution: this.config.resolution,
          generation_mode: this.config.mode,
          num_images: 1,
          output_format: "jpeg",
        },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; error?: unknown };
    if (!response.ok || !body.id) throw this.apiError(response.status, body);
    return body.id;
  }

  private async waitForResult(predictionId: string): Promise<{ outputUrl: string; creditsUsed?: number }> {
    const deadline = Date.now() + this.maxWaitMs;
    while (Date.now() < deadline) {
      await this.sleep(this.pollIntervalMs);
      const response = await this.request(`${BASE_URL}/status/${encodeURIComponent(predictionId)}`, { headers: this.authHeaders() });
      const body = (await response.json().catch(() => ({}))) as { status?: string; output?: string[]; error?: { name?: string; message?: string } | null };
      if (!response.ok) throw this.apiError(response.status, body);
      if (body.status === "completed") {
        const outputUrl = body.output?.[0];
        if (!outputUrl) throw new ImageProviderError("FASHN returned no output image", true, "EMPTY_OUTPUT");
        const credits = Number(response.headers.get("x-fashn-credits-used"));
        return { outputUrl, creditsUsed: Number.isFinite(credits) && credits > 0 ? credits : undefined };
      }
      if (body.status === "failed") {
        const name = body.error?.name ?? "PipelineError";
        throw new ImageProviderError(body.error?.message ?? "FASHN generation failed", !PERMANENT_RUNTIME_ERRORS.has(name), name);
      }
    }
    throw new ImageProviderError("Timed out waiting for FASHN", true, "TIMEOUT");
  }

  private async download(url: string): Promise<{ image: Buffer; mimeType: string }> {
    const response = await this.request(url, {});
    if (!response.ok) throw new ImageProviderError(`Could not download FASHN output (${response.status})`, true, "DOWNLOAD_FAILED");
    const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    return { image: Buffer.from(await response.arrayBuffer()), mimeType };
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.apiKey}` };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      throw new ImageProviderError(`FASHN request failed: ${error instanceof Error ? error.message : String(error)}`, true, "NETWORK");
    }
  }

  private apiError(status: number, body: { error?: unknown }): ImageProviderError {
    const name = typeof body.error === "object" && body.error && "name" in body.error ? String((body.error as { name: unknown }).name) : undefined;
    if (status === 401) return new ImageProviderError("FASHN rejected the API key", false, "UNAUTHORIZED");
    if (status === 429 && name === "OutOfCredits") return new ImageProviderError("FASHN account is out of credits", false, "OUT_OF_CREDITS");
    if (status === 429) return new ImageProviderError("FASHN rate limit reached", true, name ?? "RATE_LIMITED");
    if (status >= 400 && status < 500) return new ImageProviderError(`FASHN rejected the request (${status})`, false, name ?? "BAD_REQUEST");
    return new ImageProviderError(`FASHN server error (${status})`, true, name ?? "SERVER_ERROR");
  }
}
