import type { TestimonialEntity, TestimonialStatus } from "../../domain/entities/testimonial.entity";

export interface CreateTestimonialFields {
  orderId: string;
  customerId: string;
  rating: number;
  text: string;
}

export interface PublicTestimonialRow extends TestimonialEntity {
  customerName: string;
}

export interface AdminTestimonialRow extends TestimonialEntity {
  customerName: string;
  customerEmail: string;
  orderNumber: string;
}

export interface AdminListTestimonialsFilter {
  status?: TestimonialStatus;
  page: number;
  pageSize: number;
}

export interface AdminListTestimonialsResult {
  items: AdminTestimonialRow[];
  total: number;
}

export interface AggregateRating {
  approvedCount: number;
  /** Raw (unrounded) average — null when `approvedCount` is 0, never fabricated. */
  averageRating: number | null;
}

export interface TransitionTestimonialStatusResult {
  changed: boolean;
  testimonial: TestimonialEntity;
}

/** ADR-010: the ONLY file in the testimonials module allowed to import @woobe/database. */
export interface TestimonialRepositoryPort {
  create(fields: CreateTestimonialFields): Promise<TestimonialEntity>;
  addImage(testimonialId: string, mediaId: string): Promise<void>;
  findByOrderIdForCustomer(customerId: string, orderId: string): Promise<TestimonialEntity | null>;
  findById(testimonialId: string): Promise<TestimonialEntity | null>;
  listApproved(limit: number): Promise<PublicTestimonialRow[]>;
  getApprovedAggregate(): Promise<AggregateRating>;
  listForAdmin(filter: AdminListTestimonialsFilter): Promise<AdminListTestimonialsResult>;
  transitionStatus(testimonialId: string, from: TestimonialStatus, to: TestimonialStatus): Promise<TransitionTestimonialStatusResult>;
}
