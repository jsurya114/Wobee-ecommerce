import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../../shared/errors";
import type { TestimonialEntity } from "../../../domain/entities/testimonial.entity";
import type { AuditLoggerPort } from "../../ports/audit-logger.port";
import type { TestimonialRepositoryPort } from "../../ports/testimonial-repository.port";

/**
 * PENDING -> APPROVED only (never targets an already-moderated row) — the
 * guarded `updateMany({where:{id,status:"PENDING"}})` inside
 * `transitionStatus` is what makes this atomic under concurrent admin
 * clicks, same pattern ApproveReturnUseCase already established; `changed:
 * false` means someone else already moderated this testimonial between
 * this request's read and write, surfaced as a clean 409.
 */
export class ApproveTestimonialUseCase {
  constructor(
    private readonly testimonialRepository: TestimonialRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
  ) {}

  async execute(testimonialId: string, actor: { id: string; role: Role }): Promise<TestimonialEntity> {
    const existing = await this.testimonialRepository.findById(testimonialId);
    if (!existing) {
      throw new NotFoundError("Testimonial not found");
    }
    const result = await this.testimonialRepository.transitionStatus(testimonialId, "PENDING", "APPROVED");
    if (!result.changed) {
      throw new ConflictError("This testimonial has already been moderated");
    }
    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "TESTIMONIAL_APPROVED",
      entityType: "Testimonial",
      entityId: testimonialId,
      metadata: { orderId: result.testimonial.orderId },
    });
    return result.testimonial;
  }
}
