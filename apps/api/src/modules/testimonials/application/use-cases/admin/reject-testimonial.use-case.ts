import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../../shared/errors";
import type { TestimonialEntity } from "../../../domain/entities/testimonial.entity";
import type { AuditLoggerPort } from "../../ports/audit-logger.port";
import type { TestimonialRepositoryPort } from "../../ports/testimonial-repository.port";

/**
 * PENDING -> REJECTED, terminal — there is no REJECTED -> * transition
 * anywhere in this module (no RESUBMITTED state exists in the schema's own
 * TestimonialStatus enum), so once this succeeds the customer can never
 * submit another testimonial for this order (the schema's `orderId
 * @unique` constraint keeps the row, and rejection never deletes it).
 */
export class RejectTestimonialUseCase {
  constructor(
    private readonly testimonialRepository: TestimonialRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
  ) {}

  async execute(testimonialId: string, actor: { id: string; role: Role }): Promise<TestimonialEntity> {
    const existing = await this.testimonialRepository.findById(testimonialId);
    if (!existing) {
      throw new NotFoundError("Testimonial not found");
    }
    const result = await this.testimonialRepository.transitionStatus(testimonialId, "PENDING", "REJECTED");
    if (!result.changed) {
      throw new ConflictError("This testimonial has already been moderated");
    }
    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "TESTIMONIAL_REJECTED",
      entityType: "Testimonial",
      entityId: testimonialId,
      metadata: { orderId: result.testimonial.orderId },
    });
    return result.testimonial;
  }
}
