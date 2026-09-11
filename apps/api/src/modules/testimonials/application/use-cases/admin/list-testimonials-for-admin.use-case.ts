import type { AdminListTestimonialsFilter, AdminListTestimonialsResult, TestimonialRepositoryPort } from "../../ports/testimonial-repository.port";

export class ListTestimonialsForAdminUseCase {
  constructor(private readonly testimonialRepository: TestimonialRepositoryPort) {}

  execute(filter: AdminListTestimonialsFilter): Promise<AdminListTestimonialsResult> {
    return this.testimonialRepository.listForAdmin(filter);
  }
}
