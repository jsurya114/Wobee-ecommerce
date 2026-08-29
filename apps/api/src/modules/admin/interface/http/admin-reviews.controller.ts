import type { ListAdminReviewsQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { ListReviewsAdminUseCase } from "../../../reviews/application/use-cases/admin/list-reviews-admin.use-case";
import type { ModerateReviewUseCase } from "../../../reviews/application/use-cases/admin/moderate-review.use-case";
import type { ReviewStatus } from "../../../reviews/domain/entities/review.entity";

/** Thin permission-gated HTTP gateway onto the reviews module's own exported use-cases (ADR-025) — same shape as AdminCollectionsController. */
export class AdminReviewsController {
  constructor(
    private readonly listReviewsAdminUseCase: ListReviewsAdminUseCase,
    private readonly moderateReviewUseCase: ModerateReviewUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListAdminReviewsQuery;
    const result = await this.listReviewsAdminUseCase.execute(query);
    res.status(200).json(result);
  }

  async approve(req: Request, res: Response): Promise<void> {
    await this.moderate(req, res, "APPROVED");
  }

  async reject(req: Request, res: Response): Promise<void> {
    await this.moderate(req, res, "REJECTED");
  }

  async hide(req: Request, res: Response): Promise<void> {
    await this.moderate(req, res, "HIDDEN");
  }

  private async moderate(req: Request, res: Response, status: ReviewStatus): Promise<void> {
    const review = await this.moderateReviewUseCase.execute(requireReviewId(req), status);
    res.status(200).json({ review });
  }
}

function requireReviewId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Review id is required");
  }
  return id;
}
