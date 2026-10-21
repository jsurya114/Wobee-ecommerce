import { describe, expect, it } from "vitest";
import { FashnImageProvider } from "./fashn-image-provider";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function provider(handler: Handler) {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { calls, fashn: new FashnImageProvider({ apiKey: "k", mode: "balanced", resolution: "1k", fetchFn, sleep: async () => {}, pollIntervalMs: 0, maxWaitMs: 1000 }) };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const input = { sourceImage: Buffer.from("abc"), sourceMimeType: "image/png", angle: "BACK" as const, prompt: "back view" };

describe("FashnImageProvider", () => {
  it("submits, polls, downloads the output and reports credits", async () => {
    let polls = 0;
    const { fashn, calls } = provider((url) => {
      if (url.endsWith("/run")) return json({ id: "pred1", error: null });
      if (url.includes("/status/")) return ++polls < 2 ? json({ status: "processing" }) : json({ status: "completed", output: ["https://cdn.fashn.ai/o.jpg"] }, 200, { "x-fashn-credits-used": "2" });
      return new Response(Buffer.from("img"), { headers: { "content-type": "image/jpeg" } });
    });
    const result = await fashn.generate(input);
    expect(result).toMatchObject({ predictionId: "pred1", creditsUsed: 2, mimeType: "image/jpeg" });
    expect(result.image.toString()).toBe("img");
    expect(calls[0]!.body).toMatchObject({
      model_name: "product-to-model",
      inputs: { product_image: `data:image/png;base64,${Buffer.from("abc").toString("base64")}`, prompt: "back view", num_images: 1, generation_mode: "balanced", resolution: "1k" },
    });
  });

  it.each([
    [401, { error: { name: "UnauthorizedAccess" } }, false, "UNAUTHORIZED"],
    [429, { error: { name: "OutOfCredits" } }, false, "OUT_OF_CREDITS"],
    [429, { error: { name: "RateLimitExceeded" } }, true, "RateLimitExceeded"],
    [400, { error: { name: "BadRequest" } }, false, "BadRequest"],
    [500, {}, true, "SERVER_ERROR"],
  ])("maps HTTP %s to retryable=%s", async (status, body, retryable, code) => {
    const { fashn } = provider(() => json(body, status));
    await expect(fashn.generate(input)).rejects.toMatchObject({ retryable, code });
  });

  it("treats content moderation as permanent and pipeline errors as retryable", async () => {
    const failed = (name: string) => provider((url) => (url.endsWith("/run") ? json({ id: "p" }) : json({ status: "failed", error: { name, message: "x" } }))).fashn;
    await expect(failed("ContentModerationError").generate(input)).rejects.toMatchObject({ retryable: false });
    await expect(failed("PipelineError").generate(input)).rejects.toMatchObject({ retryable: true });
  });

  it("times out as a retryable error", async () => {
    const { fashn } = provider((url) => (url.endsWith("/run") ? json({ id: "p" }) : json({ status: "processing" })));
    const slow = new FashnImageProvider({ apiKey: "k", mode: "fast", resolution: "1k", fetchFn: ((u: string) => (u.endsWith("/run") ? json({ id: "p" }) : json({ status: "processing" }))) as unknown as typeof fetch, sleep: async () => {}, pollIntervalMs: 0, maxWaitMs: 0 });
    await expect(slow.generate(input)).rejects.toMatchObject({ code: "TIMEOUT", retryable: true });
    expect(fashn).toBeDefined();
  });
});
