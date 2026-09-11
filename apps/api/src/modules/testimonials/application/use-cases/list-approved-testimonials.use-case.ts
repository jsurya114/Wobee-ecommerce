import { deriveDisplayIdentity } from "../../domain/derive-display-identity";
import type { TestimonialImageEntity } from "../../domain/entities/testimonial.entity";
import type { TestimonialRepositoryPort } from "../ports/testimonial-repository.port";

export interface PublicTestimonialView {
  id: string;
  rating: number;
  text: string;
  createdAt: Date;
  images: TestimonialImageEntity[];
  /** Server-derived "First L." — never the raw customer name/id, never client-suppliable. */
  displayName: string;
  /** Always true here — every row this use-case returns is, by construction, an APPROVED testimonial on a DELIVERED order the author owned. */
  verifiedCustomer: true;
}

/** "Loved by Our Customers" homepage rail — APPROVED only, enforced server-side (never fetch-all-then-filter-on-client). */
export class ListApprovedTestimonialsUseCase {
  constructor(private readonly testimonialRepository: TestimonialRepositoryPort) {}

  async execute(limit: number): Promise<PublicTestimonialView[]> {
    const rows = await this.testimonialRepository.listApproved(limit);
    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      text: row.text,
      createdAt: row.createdAt,
      images: row.images,
      displayName: deriveDisplayIdentity(row.customerName),
      verifiedCustomer: true as const,
    }));
  }
}
