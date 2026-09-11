import type { TestimonialEntity } from "../../domain/entities/testimonial.entity";
import type { TestimonialRepositoryPort } from "../ports/testimonial-repository.port";

/**
 * Backs the order-detail page's "does this order already have a
 * testimonial" check. Returns the full entity (status included) at this
 * layer — the HTTP controller, not this use-case, is what strips
 * everything down to a bare boolean before it reaches the customer (see
 * TestimonialsController.myTestimonialForOrder's own comment for why: the
 * customer must never learn PENDING/APPROVED/REJECTED).
 */
export class GetMyTestimonialForOrderUseCase {
  constructor(private readonly testimonialRepository: TestimonialRepositoryPort) {}

  execute(customerId: string, orderId: string): Promise<TestimonialEntity | null> {
    return this.testimonialRepository.findByOrderIdForCustomer(customerId, orderId);
  }
}
