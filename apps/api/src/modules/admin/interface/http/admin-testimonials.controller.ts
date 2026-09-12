import type { ListAdminTestimonialsQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { ApproveTestimonialUseCase } from "../../../testimonials/application/use-cases/admin/approve-testimonial.use-case";
import type { ListTestimonialsForAdminUseCase } from "../../../testimonials/application/use-cases/admin/list-testimonials-for-admin.use-case";
import type { RejectTestimonialUseCase } from "../../../testimonials/application/use-cases/admin/reject-testimonial.use-case";

/** Thin permission-gated HTTP gateway onto the testimonials module's own exported use-cases (ADR-025) — same shape as the old AdminReviewsController it replaces. */
export class AdminTestimonialsController {
  constructor(
    private readonly listTestimonialsForAdminUseCase: ListTestimonialsForAdminUseCase,
    private readonly approveTestimonialUseCase: ApproveTestimonialUseCase,
    private readonly rejectTestimonialUseCase: RejectTestimonialUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListAdminTestimonialsQuery;
    const result = await this.listTestimonialsForAdminUseCase.execute(query);
    res.status(200).json(result);
  }

  async approve(req: Request, res: Response): Promise<void> {
    const testimonial = await this.approveTestimonialUseCase.execute(requireTestimonialId(req), req.user!);
    res.status(200).json({ testimonial });
  }

  async reject(req: Request, res: Response): Promise<void> {
    const testimonial = await this.rejectTestimonialUseCase.execute(requireTestimonialId(req), req.user!);
    res.status(200).json({ testimonial });
  }
}

function requireTestimonialId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Testimonial id is required");
  }
  return id;
}
