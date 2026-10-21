/** Carries only the generated-image id; the worker re-reads Postgres (Redis is disposable, ADR-017). */
export interface GenerationQueuePort {
  enqueue(generatedImageId: string): Promise<void>;
}
