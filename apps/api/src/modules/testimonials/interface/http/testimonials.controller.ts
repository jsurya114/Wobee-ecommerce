import type { SubmitTestimonialInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { GetMyTestimonialForOrderUseCase } from "../../application/use-cases/get-my-testimonial-for-order.use-case";
import type { SubmitTestimonialUseCase } from "../../application/use-cases/submit-testimonial.use-case";

/**
 * Controllers stay thin. The one thing worth flagging here (not obvious
 * from the use-case layer alone): neither handler below ever puts a
 * testimonial's `status` — or anything else that would let a customer
 * infer PENDING vs. APPROVED vs. REJECTED — into a response body. That's
 * the 2026-09-11 design's central anti-abuse requirement, enforced at this
 * exact boundary, not deeper in the stack (the use-cases and repository
 * both still work with the real entity/status internally, e.g. for
 * `GetMyTestimonialForOrderUseCase`'s return value).
 */
export class TestimonialsController {
  constructor(
    private readonly submitTestimonialUseCase: SubmitTestimonialUseCase,
    private readonly getMyTestimonialForOrderUseCase: GetMyTestimonialForOrderUseCase,
  ) {}

  async submit(req: Request, res: Response): Promise<void> {
    const input = req.body as SubmitTestimonialInput;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    await this.submitTestimonialUseCase.execute({
      customerId: req.user!.id,
      orderId: input.orderId,
      rating: input.rating,
      text: input.text,
      images: files.map((file) => ({
        buffer: file.buffer,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      })),
    });
    res.status(201).json({ message: "Thank you for sharing your experience." });
  }

  async myTestimonialForOrder(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const testimonial = await this.getMyTestimonialForOrderUseCase.execute(req.user!.id, orderId);
    res.status(200).json({ exists: testimonial !== null });
  }
}

function requireOrderId(req: Request): string {
  const id = req.params.orderId;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Order id is required");
  }
  return id;
}
