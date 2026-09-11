import { roundRating } from "../../domain/round-rating";
import type { TestimonialRepositoryPort } from "../ports/testimonial-repository.port";

export interface AggregateRatingView {
  approvedCount: number;
  /** Rounded to one decimal (e.g. 4.8), null when `approvedCount` is 0 — the caller must omit the whole rating display in that case rather than show a fabricated number. */
  averageRating: number | null;
}

/** Computed ONLY from APPROVED testimonials — PENDING/REJECTED never contribute (enforced by the repository's own `getApprovedAggregate` query, not a filter applied here). */
export class GetAggregateTestimonialRatingUseCase {
  constructor(private readonly testimonialRepository: TestimonialRepositoryPort) {}

  async execute(): Promise<AggregateRatingView> {
    const { approvedCount, averageRating } = await this.testimonialRepository.getApprovedAggregate();
    return {
      approvedCount,
      averageRating: averageRating === null ? null : roundRating(averageRating),
    };
  }
}
