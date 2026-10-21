import type { RequestAiImagesInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { ListGenerationsUseCase } from "../../application/use-cases/list-generations.use-case";
import type { RequestGenerationUseCase } from "../../application/use-cases/request-generation.use-case";
import type { ReviewGeneratedImageUseCase } from "../../application/use-cases/review-generated-image.use-case";

/** Thin. Every route is MANAGE_CATALOG-gated (ai-images.routes.ts), so req.user is guaranteed. */
export class AiImagesController {
  constructor(
    private readonly requestGeneration: RequestGenerationUseCase,
    private readonly listGenerations: ListGenerationsUseCase,
    private readonly review: ReviewGeneratedImageUseCase,
  ) {}

  async request(req: Request, res: Response): Promise<void> {
    const body = req.body as RequestAiImagesInput;
    const generation = await this.requestGeneration.execute({
      productId: requireParam(req, "productId"),
      sourceMediaId: body.sourceMediaId,
      angles: body.angles,
      requestedByUserId: req.user!.id,
    });
    res.status(202).json({ generation });
  }

  async list(req: Request, res: Response): Promise<void> {
    res.status(200).json({ generations: await this.listGenerations.execute(requireParam(req, "productId")) });
  }

  async approve(req: Request, res: Response): Promise<void> {
    await this.review.approve(requireParam(req, "id"));
    res.status(204).send();
  }

  async reject(req: Request, res: Response): Promise<void> {
    await this.review.reject(requireParam(req, "id"));
    res.status(204).send();
  }

  async regenerate(req: Request, res: Response): Promise<void> {
    res.status(202).json({ image: await this.review.regenerate(requireParam(req, "id")) });
  }
}

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || typeof value !== "string") throw new ValidationError(`${name} is required`);
  return value;
}
