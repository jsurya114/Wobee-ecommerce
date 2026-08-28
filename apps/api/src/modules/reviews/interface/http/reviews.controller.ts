import type { ListReviewsQuery, SubmitReviewInput, UpdateReviewInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { DeleteOwnReviewUseCase } from "../../application/use-cases/delete-own-review.use-case";
import type { ListReviewsForProductUseCase } from "../../application/use-cases/list-reviews-for-product.use-case";
import type { SubmitReviewUseCase } from "../../application/use-cases/submit-review.use-case";
import type { UpdateOwnReviewUseCase } from "../../application/use-cases/update-own-review.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class ReviewsController {
  constructor(
    private readonly listReviewsForProductUseCase: ListReviewsForProductUseCase,
    private readonly submitReviewUseCase: SubmitReviewUseCase,
    private readonly updateOwnReviewUseCase: UpdateOwnReviewUseCase,
    private readonly deleteOwnReviewUseCase: DeleteOwnReviewUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListReviewsQuery;
    const result = await this.listReviewsForProductUseCase.execute(query.productId, query.page, query.pageSize);
    res.status(200).json(result);
  }

  async submit(req: Request, res: Response): Promise<void> {
    const input = req.body as SubmitReviewInput;
    const review = await this.submitReviewUseCase.execute({ userId: req.user!.id, ...input });
    res.status(201).json({ review });
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateReviewInput;
    const review = await this.updateOwnReviewUseCase.execute(req.user!.id, requireReviewId(req), input);
    res.status(200).json({ review });
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.deleteOwnReviewUseCase.execute(req.user!.id, requireReviewId(req));
    res.status(204).send();
  }
}

function requireReviewId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Review id is required");
  }
  return id;
}
